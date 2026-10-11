import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import type { MouseEvent as ReactMouseEvent } from 'react'
import { ArrowUp, ArrowUpDown, ArrowUpRight, Check, ChevronDown, ChevronLeft, ChevronRight, Code2, Columns3, Copy, Download, ExternalLink, Eye, File, FileArchive, FileCode2, FileImage, FileText, Film, FolderClosed, GitBranch, Github, Grid2X2, HardDrive, HelpCircle, History, Image, Info, Keyboard, Link2, List, Loader2, Maximize2, Menu, Minimize2, Music, PanelLeft, PanelRight, Plus, Search, Sparkles, Star, X } from 'lucide-react'
import { demoRepository } from './lib/demo'
import { loadRepository, formatBytes, getRawUrl, getGithubUrl, getArchiveUrl } from './lib/github'
import type { RepoEntry, Repository, FileKind } from './lib/github'
import { FilePreview } from './components/FilePreview'
import { CopyPathControl } from './components/CopyPathControl'
import { formatCopyPaths, normalizeCopyPathFormat, shouldHandlePathCopy } from './lib/copy-path'
import type { CopyPathFormat } from './lib/copy-path'

type View = 'grid' | 'list' | 'columns' | 'gallery'
type Category = 'all' | 'favorites' | 'image' | 'video' | 'code' | 'document'
type Location = { path: string; category: Category }
type Recent = { url: string; name: string; owner: string }
const parentPath = (path: string) => path.includes('/') ? path.slice(0,path.lastIndexOf('/')) : ''

const KIND_LABELS: Record<FileKind, string> = {folder:'文件夹',image:'图片',video:'视频',audio:'音频',code:'代码',document:'文档',archive:'压缩文件',other:'文件'}
const views: { id: View; label: string; icon: typeof Grid2X2 }[] = [
  {id:'grid',label:'图标视图',icon:Grid2X2},{id:'list',label:'列表视图',icon:List},{id:'columns',label:'分栏视图',icon:Columns3},{id:'gallery',label:'画廊视图',icon:PanelLeft},
]

function readSaved<T,>(key: string, fallback: T): T {
  try { return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback } catch { return fallback }
}
function save(key:string, value:unknown) { try { localStorage.setItem(key,JSON.stringify(value)) } catch { /* storage is optional */ } }

function FolderArt({small = false}: {small?:boolean}) {
  return <svg className={`folder-art ${small?'small':''}`} viewBox="0 0 100 78" fill="none" aria-hidden="true"><path d="M8 18a7 7 0 0 1 7-7h23l9 9h38a7 7 0 0 1 7 7v39a7 7 0 0 1-7 7H15a7 7 0 0 1-7-7V18Z" fill="#80b9ee"/><path d="M8 30a6 6 0 0 1 6-6h72a6 6 0 0 1 6 6v36a7 7 0 0 1-7 7H15a7 7 0 0 1-7-7V30Z" fill="#4a96df"/><path d="M14 26h72" stroke="#b5d7f5" strokeWidth="2" strokeLinecap="round"/><path d="M8 64v2a7 7 0 0 0 7 7h70a7 7 0 0 0 7-7v-2" stroke="#3481cb" strokeOpacity=".4" strokeWidth="2"/></svg>
}

function FileArt({entry, compact = false}: {entry:RepoEntry;compact?:boolean}) {
  if (entry.type==='dir') return compact ? <FolderClosed size={26} className="compact-file-art kind-folder" fill="currentColor" fillOpacity={0.18}/> : <FolderArt/>
  if (entry.kind==='image' && !compact) return <div className="image-art"><img src={entry.url} alt="" loading="lazy" onError={e=>{e.currentTarget.style.visibility='hidden'}}/><FileImage className="image-fallback" size={35}/></div>
  const Icon = entry.kind==='video' ? Film : entry.kind==='audio' ? Music : entry.kind==='code' ? FileCode2 : entry.kind==='document' ? FileText : entry.kind==='archive' ? FileArchive : File
  if (compact) return <Icon size={26} className={`compact-file-art kind-${entry.kind}`}/>
  return <div className={`file-art kind-${entry.kind}`}><span className="dogear"/><Icon size={28} strokeWidth={1.3}/><span className="file-extension">{entry.name==='LICENSE'?'TXT':entry.name.split('.').pop()?.toUpperCase().slice(0,5)}</span></div>
}

export default function App() {
  const [repository,setRepository] = useState<Repository>(demoRepository)
  const [repoInput,setRepoInput] = useState('')
  const [loading,setLoading] = useState(false)
  const [error,setError] = useState('')
  const [history,setHistory] = useState<Location[]>([{path:'',category:'all'}])
  const [historyIndex,setHistoryIndex] = useState(0)
  const location = history[historyIndex]
  const [selectedPaths,setSelectedPaths] = useState<string[]>([])
  const [view,setView] = useState<View>(()=>readSaved('peek-view','grid'))
  const [copyPathFormat,setCopyPathFormat] = useState<CopyPathFormat>(()=>normalizeCopyPathFormat(readSaved('peek-copy-path-format','url')))
  const [search,setSearch] = useState('')
  const [sort,setSort] = useState('name')
  const [showInspector,setShowInspector] = useState(true)
  const [quickLook,setQuickLook] = useState(false)
  const [help,setHelp] = useState(false)
  const [recentOpen,setRecentOpen] = useState(false)
  const [sidebarOpen,setSidebarOpen] = useState(false)
  const [isMaximized,setIsMaximized] = useState(false)
  const [restoreHeight,setRestoreHeight] = useState(0)
  const [favorites,setFavorites] = useState<string[]>(()=>readSaved('peek-favorites',[]))
  const [recents,setRecents] = useState<Recent[]>(()=>readSaved('peek-recents',[]))
  const [toast,setToast] = useState('')
  const [iconSize,setIconSize] = useState(112)
  const [context,setContext] = useState<{x:number;y:number;entry:RepoEntry}|null>(null)
  const loadController = useRef<AbortController|null>(null)
  const repoInputRef = useRef<HTMLInputElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const explorerRef = useRef<HTMLDivElement>(null)
  const finderRef = useRef<HTMLElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const previousFocus = useRef<HTMLElement|null>(null)
  const anchorPath = useRef<string|null>(null)
  const repoId = `${repository.owner}/${repository.name}`
  const favoriteKey = (entry:RepoEntry)=>`${repoId}/${entry.path}`
  const selected = repository.entries.find(e=>e.path===selectedPaths[selectedPaths.length-1])
  const selectedEntries = selectedPaths.map(path=>repository.entries.find(entry=>entry.path===path)).filter((entry):entry is RepoEntry=>Boolean(entry))
  const isFavorite = (entry:RepoEntry)=>favorites.includes(favoriteKey(entry))
  const children = (path:string)=>repository.entries.filter(e=>parentPath(e.path)===path)

  const visibleEntries = useMemo(()=>{
    let entries = repository.entries.filter(e=>{
      if (search) return e.path.toLocaleLowerCase().includes(search.toLocaleLowerCase())
      if (location.category==='favorites') return favorites.includes(`${repoId}/${e.path}`)
      if (location.category!=='all') return e.kind===location.category
      return parentPath(e.path)===location.path
    })
    entries = [...entries].sort((a,b)=>{
      if(a.type!==b.type) return a.type==='dir'?-1:1
      if(sort==='size') return b.size-a.size || a.name.localeCompare(b.name)
      if(sort==='type') return a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name)
      return a.name.localeCompare(b.name, 'zh-CN', {numeric:true})
    })
    return entries
  },[repository,search,location,favorites,repoId,sort])

  const notify = useCallback((message:string)=>setToast(message),[])
  useEffect(()=>{if(toast){const timer=setTimeout(()=>setToast(''),3300);return()=>clearTimeout(timer)}},[toast])
  useEffect(()=>save('peek-view',view),[view])
  useEffect(()=>save('peek-copy-path-format',copyPathFormat),[copyPathFormat])
  useEffect(()=>save('peek-favorites',favorites),[favorites])
  useEffect(()=>save('peek-recents',recents),[recents])
  useEffect(()=>()=>loadController.current?.abort(),[])
  useEffect(()=>{
    if(!isMaximized)return
    const overflow=document.body.style.overflow
    document.body.style.overflow='hidden'
    return()=>{document.body.style.overflow=overflow}
  },[isMaximized])
  useEffect(()=>{const close=()=>setContext(null);window.addEventListener('click',close);window.addEventListener('resize',close);return()=>{window.removeEventListener('click',close);window.removeEventListener('resize',close)}},[])

  const toggleWindowSize = ()=>{
    if(!isMaximized)setRestoreHeight(finderRef.current?.getBoundingClientRect().height??0)
    setIsMaximized(value=>!value);setContext(null);setRecentOpen(false)
  }
  const focusRepoInput = ()=>{
    setIsMaximized(false);setSidebarOpen(false)
    requestAnimationFrame(()=>repoInputRef.current?.focus())
  }

  const navigate = (path:string,category:Category='all')=>{
    setHistory(h=>[...h.slice(0,historyIndex+1),{path,category}]);setHistoryIndex(historyIndex+1)
    setSelectedPaths([]);setSearch('');setSidebarOpen(false);setQuickLook(false);setContext(null);anchorPath.current=null
  }
  const moveHistory = (delta:number)=>{
    setHistoryIndex(i=>Math.max(0,Math.min(history.length-1,i+delta)));setSelectedPaths([]);setSearch('');setQuickLook(false);setContext(null);anchorPath.current=null
  }
  const changeSearch = (value:string)=>{
    setSearch(value);setSelectedPaths([]);setQuickLook(false);setContext(null);anchorPath.current=null
  }
  const openRepo = async (input:string)=>{
    if(!input.trim()){focusRepoInput();return}
    loadController.current?.abort();const controller=new AbortController();loadController.current=controller
    setLoading(true);setError('');setRecentOpen(false);setQuickLook(false);setContext(null);anchorPath.current=null
    try {
      const repo = await loadRepository(input.trim(),controller.signal)
      if(controller.signal.aborted)return
      setRepository(repo);setHistory([{path:repo.initialPath||'',category:'all'}]);setHistoryIndex(0)
      setSelectedPaths(repo.initialSelection?[repo.initialSelection]:[]);setSearch('');setQuickLook(false)
      setRepoInput(`https://github.com/${repo.owner}/${repo.name}`)
      const recent={url:`https://github.com/${repo.owner}/${repo.name}`,name:repo.name,owner:repo.owner}
      setRecents(r=>[recent,...r.filter(x=>x.url!==recent.url)].slice(0,8))
      notify(`已打开 ${repo.owner}/${repo.name}`)
    } catch(e) {if(!controller.signal.aborted)setError(e instanceof Error?e.message:'打开失败，请重试。')}
    finally{if(!controller.signal.aborted)setLoading(false)}
  }
  const openDemo = ()=>{
    loadController.current?.abort();setLoading(false);setRepository(demoRepository);setHistory([{path:'',category:'all'}]);setHistoryIndex(0);setSelectedPaths([]);setSearch('');setError('');setRepoInput('');setRecentOpen(false);setQuickLook(false);setContext(null);anchorPath.current=null
  }
  const selectEntry = (entry:RepoEntry,event?:ReactMouseEvent,entries:RepoEntry[]=visibleEntries)=>{
    const index=entries.findIndex(e=>e.path===entry.path)
    const anchor=entries.findIndex(e=>e.path===anchorPath.current)
    if(event?.shiftKey&&anchor>=0&&index>=0){
      const range=entries.slice(Math.min(anchor,index),Math.max(anchor,index)+1).map(e=>e.path)
      setSelectedPaths(index<anchor?range.reverse():range)
    }
    else if(event?.metaKey||event?.ctrlKey){setSelectedPaths(s=>s.includes(entry.path)?s.filter(p=>p!==entry.path):[...s,entry.path]);anchorPath.current=entry.path}
    else{setSelectedPaths([entry.path]);anchorPath.current=entry.path}
  }
  const showContext = (entry:RepoEntry,event:ReactMouseEvent)=>{
    event.preventDefault()
    if(!selectedPaths.includes(entry.path)){setSelectedPaths([entry.path]);anchorPath.current=entry.path}
    setContext({x:Math.max(0,Math.min(event.clientX,window.innerWidth-220)),y:Math.max(0,Math.min(event.clientY,window.innerHeight-260)),entry})
  }
  const openEntry = (entry:RepoEntry)=>{if(entry.type==='dir')navigate(entry.path);else{setSelectedPaths([entry.path]);anchorPath.current=entry.path;setQuickLook(true)}}
  const toggleFavorite = (entry:RepoEntry)=>setFavorites(f=>f.includes(favoriteKey(entry))?f.filter(x=>x!==favoriteKey(entry)):[...f,favoriteKey(entry)])
  const announceCopy = (entries:RepoEntry[])=>notify(`已复制${entries.length>1?` ${entries.length} 个`:''}${copyPathFormat==='url'?'完整链接':'相对路径'}`)
  const copyPaths = async (entries:RepoEntry[]=selectedEntries)=>{
    const text=formatCopyPaths(repository,entries,copyPathFormat)
    if(!text)return
    try{
      await navigator.clipboard.writeText(text)
      announceCopy(entries)
    }catch{notify('无法访问剪贴板，请选中文件信息中的路径手动复制。')}
  }
  const copyPath = (entry:RepoEntry)=>copyPaths([entry])
  const downloadFile = async (entry:RepoEntry)=>{
    if(entry.type==='dir')return
    try{
      notify('正在准备下载…')
      let blob:Blob
      if(entry.content!==undefined)blob=new Blob([entry.content],{type:'text/plain;charset=utf-8'})
      else {const response=await fetch(getRawUrl(repository,entry));if(!response.ok)throw new Error();blob=await response.blob()}
      const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=entry.name;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);notify(`已交给浏览器下载：${entry.name}`)
    }catch{notify('下载失败，请通过「在 GitHub 打开」获取原文件。')}
  }
  const downloadRepo = ()=>{
    if(repository.isDemo){notify('当前是示例仓库，请先输入真实 GitHub 链接。');focusRepoInput();return}
    const a=document.createElement('a');a.href=getArchiveUrl(repository);a.target='_blank';a.rel='noopener noreferrer';a.click();notify('已交给浏览器下载仓库 ZIP')
  }

  useEffect(()=>{
    const onKey=(event:KeyboardEvent)=>{
      const target=event.target instanceof Element?event.target:null
      const typing=Boolean(target?.closest('input,textarea,select,[contenteditable="true"]'))
      const modifier=event.metaKey||event.ctrlKey
      if(shouldHandlePathCopy(event,{
        typing,
        hasTextSelection:Boolean(window.getSelection()?.toString()),
        hasEntries:selectedEntries.length>0,
        inWorkspace:!help&&Boolean(target?.closest('.finder-window,.context-menu')||(quickLook&&target&&dialogRef.current?.contains(target))),
      })){
        event.preventDefault();void copyPaths(quickLook&&selected?[selected]:selectedEntries);return
      }
      if(modifier&&['k','f'].includes(event.key.toLowerCase())){
        event.preventDefault();setQuickLook(false);setHelp(false);setRecentOpen(false);setContext(null)
        const openingRepository=event.key.toLowerCase()==='k'
        if(openingRepository)setIsMaximized(false)
        const destination=openingRepository?repoInputRef.current:searchRef.current
        previousFocus.current=destination;requestAnimationFrame(()=>destination?.focus())
        return
      }
      if(event.key==='Escape'){
        if(quickLook||help){event.preventDefault();setQuickLook(false);setHelp(false)}
        else if(context){event.preventDefault();setContext(null)}
        else if(sidebarOpen||recentOpen){event.preventDefault();setSidebarOpen(false);setRecentOpen(false)}
        else if(isMaximized){event.preventDefault();setIsMaximized(false)}
        return
      }
      if(typing||help)return
      const fileButton=target?.closest('.file-item,.file-row,.column-file,.gallery-strip button')
      const inExplorer=Boolean(target&&explorerRef.current?.contains(target)&&(target===explorerRef.current||fileButton))
      const inQuickLook=Boolean(quickLook&&target&&dialogRef.current?.contains(target))
      const previewControl=Boolean(target?.closest('video,audio,iframe,.fp-code-scroll,.fp-markdown'))
      const interactive=Boolean(target?.closest('button,a,input,textarea,select,video,audio,iframe,[contenteditable="true"],[tabindex="0"]'))
      const focusedEntry=repository.entries.find(entry=>entry.path===fileButton?.getAttribute('data-entry-path'))
      const activeEntry=focusedEntry??selected
      const columnPath=view==='columns'&&location.category==='all'&&!search
        ? fileButton?.closest('.file-column')?.getAttribute('data-column-path')??(selected?parentPath(selected.path):location.path)
        : null
      const keyboardEntries=columnPath!==null?children(columnPath):visibleEntries
      if(modifier&&event.key.toLowerCase()==='a'&&inExplorer){event.preventDefault();setSelectedPaths(keyboardEntries.map(e=>e.path));anchorPath.current=keyboardEntries[0]?.path??null;return}
      if(event.key===' '&&activeEntry&&(inExplorer||(inQuickLook&&!interactive))){
        event.preventDefault()
        if(inExplorer&&activeEntry.path!==selected?.path){setSelectedPaths([activeEntry.path]);anchorPath.current=activeEntry.path}
        setQuickLook(q=>!q);return
      }
      if(event.key==='Enter'&&activeEntry&&inExplorer){event.preventDefault();openEntry(activeEntry);return}
      if(event.altKey&&event.key==='ArrowLeft'&&inExplorer){event.preventDefault();moveHistory(-1);return}
      if(event.altKey&&event.key==='ArrowRight'&&inExplorer){event.preventDefault();moveHistory(1);return}
      if(modifier&&event.key==='ArrowUp'&&inExplorer){event.preventDefault();navigate(location.path.split('/').slice(0,-1).join('/'));return}
      if(['ArrowRight','ArrowLeft','ArrowDown','ArrowUp'].includes(event.key)&&keyboardEntries.length&&!modifier&&!event.altKey&&(inExplorer||(inQuickLook&&!previewControl))){
        event.preventDefault();const index=keyboardEntries.findIndex(e=>e.path===(inExplorer?activeEntry:selected)?.path)
        let distance=1
        if(view==='grid'&&inExplorer&&['ArrowDown','ArrowUp'].includes(event.key)){
          const current=explorerRef.current?.querySelector(`[data-entry-path="${CSS.escape(keyboardEntries[Math.max(0,index)].path)}"]`)
          const grid=current?.closest('.file-grid')
          if(grid)distance=Math.max(1,getComputedStyle(grid).gridTemplateColumns.split(/\s+/).filter(Boolean).length)
        }
        const step=event.key==='ArrowLeft'||event.key==='ArrowUp'?-distance:distance
        let next=index<0?0:Math.max(0,Math.min(keyboardEntries.length-1,index+step))
        if(view==='grid'&&inExplorer&&index>=0&&['ArrowDown','ArrowUp'].includes(event.key)){
          const current=explorerRef.current?.querySelector(`[data-entry-path="${CSS.escape(keyboardEntries[index].path)}"]`)
          const rect=current?.getBoundingClientRect()
          if(rect){
            const candidates=keyboardEntries.map((entry,i)=>({i,rect:explorerRef.current?.querySelector(`[data-entry-path="${CSS.escape(entry.path)}"]`)?.getBoundingClientRect()})).filter(item=>item.rect&&(event.key==='ArrowDown'?item.rect.top>rect.top+5:item.rect.top<rect.top-5))
            const nearest=candidates.sort((a,b)=>Math.abs(a.rect!.top-rect.top)-Math.abs(b.rect!.top-rect.top)||Math.abs(a.rect!.left-rect.left)-Math.abs(b.rect!.left-rect.left))[0]
            next=nearest?.i??index
          }
        }
        if(event.shiftKey&&inExplorer&&index>=0){
          const savedAnchor=keyboardEntries.findIndex(entry=>entry.path===anchorPath.current)
          const anchor=savedAnchor>=0?savedAnchor:index
          anchorPath.current=keyboardEntries[anchor].path
          const range=keyboardEntries.slice(Math.min(anchor,next),Math.max(anchor,next)+1).map(entry=>entry.path)
          setSelectedPaths(next<anchor?range.reverse():range)
        }else{setSelectedPaths([keyboardEntries[next].path]);anchorPath.current=keyboardEntries[next].path}
        requestAnimationFrame(()=>{
          const item=explorerRef.current?.querySelector<HTMLElement>(`[data-entry-path="${CSS.escape(keyboardEntries[next].path)}"]`)
          if(inExplorer){item?.scrollIntoView({block:'nearest'});item?.focus({preventScroll:true})}
          else if(inQuickLook&&!dialogRef.current?.contains(document.activeElement))dialogRef.current?.focus()
        })
      }
    }
    // Some Mac browser shells route the system Copy command directly to a copy event.
    const onCopy=(event:ClipboardEvent)=>{
      const target=event.target instanceof Element?event.target:null
      if(!event.clipboardData||!shouldHandlePathCopy({key:'c',metaKey:true,ctrlKey:false,altKey:false,shiftKey:false},{
        typing:Boolean(target?.closest('input,textarea,select,[contenteditable="true"]')),
        hasTextSelection:Boolean(window.getSelection()?.toString()),
        hasEntries:selectedEntries.length>0,
        inWorkspace:!help&&Boolean(target?.closest('.finder-window,.context-menu')||(quickLook&&target&&dialogRef.current?.contains(target))),
      }))return
      const entries=quickLook&&selected?[selected]:selectedEntries
      event.preventDefault();event.clipboardData.setData('text/plain',formatCopyPaths(repository,entries,copyPathFormat));announceCopy(entries)
    }
    window.addEventListener('keydown',onKey);window.addEventListener('copy',onCopy)
    return()=>{window.removeEventListener('keydown',onKey);window.removeEventListener('copy',onCopy)}
  })

  useEffect(()=>{
    if(!quickLook&&!help)return
    previousFocus.current=document.activeElement as HTMLElement
    const focusTimer=setTimeout(()=>{
      if(help)dialogRef.current?.querySelector<HTMLElement>('button')?.focus()
      else dialogRef.current?.focus()
    },0)
    const trap=(event:KeyboardEvent)=>{
      if(event.key!=='Tab')return
      const items=Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input,video[controls],audio[controls],[tabindex="0"]')||[])
      if(!items.length)return
      if(!items.includes(document.activeElement as HTMLElement)){event.preventDefault();items[event.shiftKey?items.length-1:0].focus()}
      else if(event.shiftKey&&document.activeElement===items[0]){event.preventDefault();items[items.length-1].focus()}
      else if(!event.shiftKey&&document.activeElement===items[items.length-1]){event.preventDefault();items[0].focus()}
    }
    window.addEventListener('keydown',trap)
    return()=>{clearTimeout(focusTimer);window.removeEventListener('keydown',trap);previousFocus.current?.focus()}
  },[quickLook,help])

  const categoryNames:Record<Category,string>={all:'全部文件',favorites:'收藏夹',image:'所有图片',video:'所有视频',code:'所有代码',document:'所有文档'}
  const categoryItems:{id:Category;icon:typeof FolderClosed;label:string}[]=[{id:'all',icon:HardDrive,label:'全部文件'},{id:'favorites',icon:Star,label:'收藏夹'},{id:'image',icon:Image,label:'图片'},{id:'video',icon:Film,label:'视频'},{id:'code',icon:Code2,label:'代码'},{id:'document',icon:FileText,label:'文档'}]
  const fileCount=repository.entries.filter(e=>e.type==='file').length
  const totalSize=repository.entries.reduce((sum,e)=>sum+e.size,0)
  const folderEntries=visibleEntries.filter(e=>e.type==='dir')
  const fileEntries=visibleEntries.filter(e=>e.type==='file')
  const displayTitle=search?`搜索「${search}」`:location.category!=='all'?categoryNames[location.category]:location.path.split('/').pop()||repository.name
  const galleryEntry=selected||fileEntries[0]||visibleEntries[0]
  const columnPaths=['',...location.path.split('/').filter(Boolean).map((_,i)=>location.path.split('/').slice(0,i+1).join('/'))]

  const entryButton=(entry:RepoEntry,compact=false)=>{
    const selectedState=selectedPaths.includes(entry.path)
    return <button key={entry.path} className={`${compact?'file-row':'file-item'} ${selectedState?'selected':''}`} aria-label={`${entry.name}，${KIND_LABELS[entry.kind]}`} aria-pressed={selectedState} data-entry-path={entry.path} data-entry-index={visibleEntries.findIndex(e=>e.path===entry.path)} onClick={e=>selectEntry(entry,e)} onDoubleClick={()=>openEntry(entry)} onContextMenu={e=>showContext(entry,e)}>
      <FileArt entry={entry} compact={compact}/><span className="entry-name">{entry.name}</span>
      {compact?<><span className="row-size">{entry.type==='dir'?'—':formatBytes(entry.size)}</span><span className="row-kind">{KIND_LABELS[entry.kind]}</span><ChevronRight size={13} className="row-chevron"/></>:<span className="entry-meta">{entry.type==='dir'?`${children(entry.path).length} 个项目`:formatBytes(entry.size)}</span>}
      {isFavorite(entry)&&<Star className="entry-star" size={11} fill="currentColor"/>}
    </button>
  }

  const windowSizeButton = (mobile=false)=><button type="button" className={mobile?'icon-button window-size-toggle':'window-zoom'} aria-label={isMaximized?'恢复文件浏览器':'放大文件浏览器'} title={isMaximized?'恢复文件浏览器 (Esc)':'放大文件浏览器'} aria-pressed={isMaximized} aria-controls="repository-finder" onClick={toggleWindowSize}>{isMaximized?<Minimize2 size={mobile?16:9}/>:<Maximize2 size={mobile?16:9}/>}</button>

  return <div className="app-shell" onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();const url=e.dataTransfer.getData('text/uri-list')||e.dataTransfer.getData('text/plain');if(url.startsWith('https://github.com/')){setRepoInput(url);void openRepo(url)}}}>
    <header className="app-header" inert={quickLook||help||isMaximized}>
      <a className="brand" href="#" onClick={e=>{e.preventDefault();openDemo()}} aria-label="Peek 首页"><span className="brand-mark"><svg viewBox="0 0 32 32" aria-hidden="true"><path d="M5 10h9l3 4h10v13H5Z" fill="currentColor"/><path d="M12 18v4m9-4v4" stroke="#fefcf6" strokeWidth="2.7" strokeLinecap="round"/></svg></span><span className="brand-word">peek<span className="brand-dot">.</span></span><span className="brand-by">by Brclio</span></a>
      <nav className="top-nav" aria-label="主导航"><button className={!recentOpen?'active':''} onClick={()=>setRecentOpen(false)}><FolderClosed size={15}/>文件浏览器</button><button className={recentOpen?'active':''} onClick={()=>setRecentOpen(v=>!v)}><History size={15}/>最近打开{recents.length>0&&<span className="nav-count">{recents.length}</span>}</button></nav>
      <button className="help-button" aria-label="使用指南" onClick={()=>setHelp(true)}><HelpCircle size={16}/><span>使用指南</span><ArrowUpRight size={14}/></button>
      {recentOpen&&<div className="recent-popover"><div className="popover-heading">最近打开的仓库<button className="icon-button" aria-label="关闭最近打开" onClick={()=>setRecentOpen(false)}><X size={15}/></button></div>{recents.length?recents.map(r=><button className="recent-item" key={r.url} onClick={()=>void openRepo(r.url)}><Github size={20}/><span><strong>{r.name}</strong><small>{r.owner}</small></span><ArrowUpRight size={15}/></button>):<div className="recent-empty"><History size={26}/><p>你打开过的仓库会出现在这里。</p><button onClick={()=>{setRecentOpen(false);repoInputRef.current?.focus()}}>打开第一个仓库 <ArrowUpRight size={13}/></button></div>}</div>}
    </header>

    <main className="main-layout" inert={quickLook||help}>
      <section className="intro-row" inert={isMaximized}><div><div className="eyebrow"><span/>A LITTLE PEEK, A LOT TO DISCOVER</div><h1>GitHub 仓库，<span>像文件夹一样打开。</span></h1><p>熟悉的浏览方式，更轻松的发现。图片、视频、代码，按下空格就能预览。</p></div><div className="intro-note"><span className="note-spark">✳</span><span>少一点下载等待<br/>多一点即刻发现</span><svg viewBox="0 0 65 34" fill="none" aria-hidden="true"><path d="M2 5c18 26 40 23 58 7m-10-1 12-2-4 11" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg></div></section>

      <section className="repo-input-section" aria-label="打开 GitHub 仓库" inert={isMaximized}><form className="repo-form" onSubmit={e=>{e.preventDefault();void openRepo(repoInput)}}><Github size={21}/><input ref={repoInputRef} value={repoInput} onChange={e=>setRepoInput(e.target.value)} placeholder="粘贴 GitHub 仓库链接，例如 github.com/owner/repo" aria-label="GitHub 仓库链接" autoComplete="url" spellCheck={false}/><kbd className="input-shortcut">⌘ K</kbd><button className="primary-button" type="submit" aria-label="打开 GitHub 仓库" disabled={loading}>{loading?<Loader2 size={16} className="loading-spin"/>:<ArrowUpRight size={17}/>}<span>{loading?'正在打开':'打开仓库'}</span></button></form><div className="input-hint"><span><span className="status-dot"/>支持公开仓库 · 无需登录 GitHub</span><button onClick={openDemo}>先逛逛示例仓库<ArrowUpRight size={12}/></button></div></section>
      {error&&!isMaximized&&<div className="error-banner" role="alert"><Info size={17}/><span>{error}</span><button className="icon-button" aria-label="关闭错误" onClick={()=>setError('')}><X size={16}/></button></div>}

      <div className="finder-frame" style={isMaximized?{height:restoreHeight}:undefined}>
      <section ref={finderRef} id="repository-finder" className={`finder-window ${showInspector?'has-inspector':''} ${isMaximized?'is-maximized':''}`} aria-label="仓库文件浏览器" aria-busy={loading}>
        <aside className={`finder-sidebar ${sidebarOpen?'mobile-open':''}`}>
          <div className="sidebar-top"><div className="traffic-lights"><i aria-hidden="true"/><i aria-hidden="true"/>{windowSizeButton()}</div><span className="sidebar-workspace">工作区</span><button className="icon-button sidebar-close" aria-label="关闭侧边栏" onClick={()=>setSidebarOpen(false)}><X size={15}/></button></div>
          <div className="sidebar-group-label">资料库</div>
          <nav className="sidebar-nav" aria-label="文件分类">{categoryItems.map(({id,icon:Icon,label})=><button key={id} className={location.category===id?'active':''} onClick={()=>navigate('',id)}><Icon size={17}/><span>{label}</span>{['image','video','code','document'].includes(id)&&<small>{repository.entries.filter(e=>e.kind===id).length}</small>}</button>)}</nav>
          <div className="sidebar-group-label repo-group">当前仓库</div><button className="sidebar-repo" onClick={()=>navigate('')}><span className="repo-avatar">{repository.owner.slice(0,1).toUpperCase()}</span><span><strong>{repository.name}</strong><small>{repository.owner}</small></span><span className="status-dot"/></button>
          <button className="add-repository" onClick={focusRepoInput}><Plus size={15}/>打开其他仓库</button>
          <div className="sidebar-bottom"><div className="mini-folder"><FolderArt small/><span className="tiny-star">✦</span></div><strong>好东西，值得一探。</strong><p>让每一个仓库<br/>都成为你的灵感文件夹。</p><button onClick={()=>setHelp(true)}>认识 Peek<ArrowUpRight size={12}/></button></div>
        </aside>

        <div className="finder-main">
          {error&&isMaximized&&<div className="error-banner" role="alert"><Info size={17}/><span>{error}</span><button className="icon-button" aria-label="关闭错误" onClick={()=>setError('')}><X size={16}/></button></div>}
          <div className="finder-toolbar"><div className="navigation-controls">{windowSizeButton(true)}<button className="icon-button sidebar-toggle" aria-label="切换侧边栏" onClick={()=>setSidebarOpen(v=>!v)}><Menu size={18}/></button><button className="icon-button" title="后退 (⌥ ←)" aria-label="后退" disabled={historyIndex===0} onClick={()=>moveHistory(-1)}><ChevronLeft size={19}/></button><button className="icon-button" title="前进 (⌥ →)" aria-label="前进" disabled={historyIndex===history.length-1} onClick={()=>moveHistory(1)}><ChevronRight size={19}/></button>{location.path&&<button className="icon-button" title="返回上级目录 (⌘ ↑)" aria-label="返回上级目录" onClick={()=>navigate(parentPath(location.path))}><ArrowUp size={16}/></button>}</div><div className="toolbar-title"><strong>{displayTitle}</strong><span>{repository.isDemo?'示例仓库':`${repository.owner}/${repository.name}`}</span></div><div className="toolbar-actions"><CopyPathControl format={copyPathFormat} onFormatChange={setCopyPathFormat} onCopy={()=>void copyPaths()} selectedCount={selectedEntries.length}/><button className="icon-button" title="下载整个仓库 ZIP" aria-label="下载仓库 ZIP" onClick={downloadRepo}><Download size={17}/></button><button className="icon-button" title="快速预览 (空格)" aria-label="快速预览" disabled={!selected} onClick={()=>setQuickLook(true)}><Eye size={18}/></button><span className="toolbar-divider"/><button className={`icon-button ${showInspector?'toggled':''}`} title="切换预览栏" aria-label="切换预览栏" aria-pressed={showInspector} onClick={()=>setShowInspector(v=>!v)}><PanelRight size={17}/></button></div></div>
          <div className="finder-subtoolbar"><div className="branch-select"><GitBranch size={14}/><select aria-label="分支" value={repository.branch} disabled={loading||repository.isDemo} onChange={e=>void openRepo(`https://github.com/${repoId}/tree/${e.target.value.split('/').map(encodeURIComponent).join('/')}`)}>{[...new Set([repository.branch,...(repository.branches||[])])].map(b=><option key={b} value={b}>{b}</option>)}</select><ChevronDown size={11}/></div><div className="view-switcher" aria-label="视图模式">{views.map(({id,label,icon:Icon})=><button key={id} aria-label={label} title={label} aria-pressed={view===id} className={view===id?'active':''} onClick={()=>{setView(id);if(id==='gallery'&&!selected&&fileEntries[0])setSelectedPaths([fileEntries[0].path])}}><Icon size={15}/></button>)}</div><div className="sort-control"><ArrowUpDown size={13}/><select aria-label="排序方式" value={sort} onChange={e=>setSort(e.target.value)}><option value="name">名称</option><option value="size">大小</option><option value="type">类型</option></select><ChevronDown size={10}/></div><div className="file-search"><Search size={14}/><input ref={searchRef} aria-label="搜索文件" placeholder="搜索文件…" value={search} onChange={e=>changeSearch(e.target.value)}/>{search&&<button aria-label="清除搜索" onClick={()=>changeSearch('')}><X size={12}/></button>}</div></div>

          <div className="finder-body"><div className="explorer" ref={explorerRef} tabIndex={0} aria-label="文件区域">
            <div className="directory-heading"><span>{search?'搜索结果':location.category!=='all'?categoryNames[location.category]:location.path?location.path.split('/').pop():'仓库概览'}</span><span>{visibleEntries.length} 个项目</span></div>
            {loading?<div className="loading-state"><Loader2 size={29} className="loading-spin"/><strong>正在读取仓库…</strong><p>马上就能和文件见面了</p><button onClick={()=>{loadController.current?.abort();setLoading(false)}}>取消</button></div>:visibleEntries.length===0?<div className="empty-state"><Search size={34} strokeWidth={1.2}/><h2>{location.category==='favorites'?'把喜欢的文件留在这里':'这里暂时没有文件'}</h2><p>{location.category==='favorites'?'右键点击文件，选择「添加到收藏」。':search?'换个关键词，再发现一点好东西。':'试试其他分类，或打开另一个仓库。'}</p></div>:view==='grid'?<div className="grid-view" style={{'--icon-size':`${iconSize}px`} as React.CSSProperties}>{folderEntries.length>0&&<><div className="grid-section-label">文件夹<span>{folderEntries.length}</span></div><div className="file-grid">{folderEntries.map(e=>entryButton(e))}</div></>}{fileEntries.length>0&&<><div className="grid-section-label">{search||location.category!=='all'?'文件':'文件与素材'}<span>{fileEntries.length}</span></div><div className="file-grid">{fileEntries.map(e=>entryButton(e))}</div></>}</div>:view==='list'?<div className="list-view"><div className="list-heading"><span>名称</span><span>大小</span><span>种类</span></div>{visibleEntries.map(e=>entryButton(e,true))}</div>:view==='columns'&&location.category==='all'&&!search?<div className="columns-view">{columnPaths.map((path,i)=><div className="file-column" key={path} data-column-path={path}><div className="column-heading">{path.split('/').pop()||repository.name}</div>{children(path).map(e=><button key={e.path} className={`column-file ${selectedPaths.includes(e.path)||columnPaths[i+1]===e.path?'selected':''}`} aria-label={`${e.name}，${KIND_LABELS[e.kind]}`} aria-pressed={selectedPaths.includes(e.path)} data-entry-path={e.path} onClick={event=>e.type==='dir'&&!event.metaKey&&!event.ctrlKey&&!event.shiftKey?navigate(e.path):selectEntry(e,event,children(path))} onDoubleClick={()=>openEntry(e)} onContextMenu={event=>showContext(e,event)}><FileArt entry={e} compact/><span>{e.name}</span>{e.type==='dir'&&<ChevronRight size={13}/>}</button>)}</div>)}</div>:view==='columns'?<div className="list-view"><div className="list-heading"><span>名称</span><span>大小</span><span>种类</span></div>{visibleEntries.map(e=>entryButton(e,true))}</div>:<div className="gallery-view">{galleryEntry&&<div className="gallery-stage"><FilePreview entry={galleryEntry} repository={repository} large onDownload={()=>void downloadFile(galleryEntry)}/></div>}<div className="gallery-strip">{visibleEntries.map(e=><button key={e.path} title={e.name} className={selectedPaths.includes(e.path)||galleryEntry?.path===e.path?'selected':''} aria-label={`${e.name}，${KIND_LABELS[e.kind]}`} aria-pressed={selectedPaths.includes(e.path)} data-entry-path={e.path} data-entry-index={visibleEntries.findIndex(entry=>entry.path===e.path)} onClick={event=>selectEntry(e,event)} onDoubleClick={()=>openEntry(e)} onContextMenu={event=>showContext(e,event)}><FileArt entry={e}/><span>{e.name}</span></button>)}</div></div>}
            {view==='grid'&&!loading&&visibleEntries.length>0&&<div className="space-hint"><span className="space-symbol">␣</span>一点好奇，一下空格。<span>选中文件，即刻预览</span></div>}
          </div>

          {showInspector&&<aside className="inspector" aria-label="文件预览栏"><div className="inspector-header"><span>{selectedPaths.length>1?'所选项目':selected?'预览':'仓库信息'}</span>{selected&&selectedPaths.length===1?<button className={`icon-button ${isFavorite(selected)?'is-favorite':''}`} title="收藏文件" aria-label="收藏文件" aria-pressed={isFavorite(selected)} onClick={()=>toggleFavorite(selected)}><Star size={15} fill={isFavorite(selected)?'currentColor':'none'}/></button>:<Info size={15}/>}</div>{selectedPaths.length>1?<div className="multi-info"><FolderArt/><h2>已选择 {selectedPaths.length} 个项目</h2><p>{formatBytes(selectedEntries.reduce((n,e)=>n+e.size,0))}</p><button className="secondary-button" onClick={()=>void copyPaths()}><Copy size={14}/>复制所选路径 <kbd>⌘ C</kbd></button><p className="copy-path-hint">{copyPathFormat==='url'?'完整 GitHub 链接，每行一个':'从仓库根目录开始，每行一个'}</p></div>:selected?<><FilePreview entry={selected} repository={repository}/><div className="file-details"><div><span>{copyPathFormat==='url'?'完整链接':'相对路径'}</span><button className="path-value" title={formatCopyPaths(repository,[selected],copyPathFormat)} aria-label="复制当前文件路径" onClick={()=>void copyPath(selected)}>{formatCopyPaths(repository,[selected],copyPathFormat)}<Copy size={12}/></button></div><p className="copy-path-hint">{copyPathFormat==='url'?'复制包含分支和文件位置的 GitHub 链接':'从仓库根目录开始，不随当前文件夹改变'}</p></div><div className="inspector-file-actions"><button className="secondary-button" onClick={()=>setQuickLook(true)}><Eye size={14}/>快速预览 <kbd>空格</kbd></button>{selected.type==='file'&&<button className="text-button" onClick={()=>void downloadFile(selected)}><Download size={13}/>下载文件</button>}</div></>:<><div className="repo-illustration"><span className="illustration-circle"/><FolderArt/><span className="illustration-spark one">✦</span><span className="illustration-spark two">✧</span><span className="illustration-dot"/></div><div className="repo-inspector-title"><h2>{repository.name}</h2><span className={`repo-badge ${repository.isDemo?'':'live'}`}>{repository.isDemo?'示例仓库':'公开仓库'}</span><p>{repository.description||'探索这个仓库里的每一个文件。'}</p></div><div className="file-details repository-details"><div><span>所有者</span><strong>{repository.owner}</strong></div><div><span>当前分支</span><strong><GitBranch size={12}/>{repository.branch}</strong></div><div><span>文件数量</span><strong>{fileCount} 个文件</strong></div><div><span>文件总大小</span><strong>{formatBytes(totalSize)}</strong></div></div>{!repository.isDemo&&<a className="github-link" href={repository.htmlUrl} target="_blank" rel="noreferrer"><Github size={14}/>在 GitHub 中打开<ExternalLink size={12}/></a>}<div className="inspector-tip"><Sparkles size={16}/><p>双击文件夹进入目录<br/>选中文件，按空格快速预览</p></div></>}</aside>}
          </div>
          <div className="finder-status"><div className="breadcrumbs"><button aria-label="仓库根目录" onClick={()=>navigate('')}><Github size={12}/><span>{repository.name}</span></button>{location.category!=='all'?<><ChevronRight size={11}/><span>{categoryNames[location.category]}</span></>:location.path.split('/').filter(Boolean).map((part,index)=><span className="crumb-pair" key={index}><ChevronRight size={11}/><button onClick={()=>navigate(location.path.split('/').slice(0,index+1).join('/'))}>{part}</button></span>)}</div><div className="status-right"><span>{selectedPaths.length?`已选 ${selectedPaths.length} 项 / `:''}{visibleEntries.length} 个项目</span>{view==='grid'&&<div className="size-slider"><Grid2X2 size={10}/><input type="range" aria-label="图标大小" min="90" max="160" value={iconSize} onChange={e=>setIconSize(Number(e.target.value))}/><Grid2X2 size={14}/></div>}</div></div>
        </div>
      </section>

      </div>

      <section className="feature-notes" aria-label="浏览提示" inert={isMaximized}><div><span className="feature-icon"><Link2 size={18}/></span><span><strong>一个链接，就够了</strong><small>打开公开仓库，无需克隆和安装</small></span></div><div><span className="feature-icon yellow"><Keyboard size={18}/></span><span><strong>你的肌肉记忆，依然管用</strong><small>空格预览、方向键选择、双击打开</small></span></div><div><span className="feature-icon red"><FileImage size={18}/></span><span><strong>不止代码，还有灵感</strong><small>图片、视频、文档，尽收眼底</small></span></div></section>
      <footer className="page-footer" inert={isMaximized}><span>Made for the curious. <span className="footer-spark">✳</span> Crafted by <a href="https://brclio.com" target="_blank" rel="noreferrer">Brclio</a></span><span>一探究竟，从这里开始。<button onClick={()=>setHelp(true)}>键盘快捷键 <Keyboard size={13}/></button></span></footer>
    </main>

    {context&&!quickLook&&!help&&<div className="context-menu" style={{left:context.x,top:context.y}} role="menu"><button role="menuitem" onClick={()=>openEntry(context.entry)}><Eye size={15}/>{context.entry.type==='dir'?'打开文件夹':'快速预览'}<kbd>↵</kbd></button><button role="menuitem" onClick={()=>toggleFavorite(context.entry)}><Star size={15}/>{isFavorite(context.entry)?'取消收藏':'添加到收藏'}</button><button role="menuitem" onClick={()=>void copyPaths()}><Copy size={15}/>{copyPathFormat==='url'?'复制完整链接':'复制相对路径'}<kbd>⌘ C</kbd></button>{context.entry.type==='file'&&<button role="menuitem" onClick={()=>void downloadFile(context.entry)}><Download size={15}/>下载文件</button>}{!repository.isDemo&&<a role="menuitem" href={getGithubUrl(repository,context.entry)} target="_blank" rel="noreferrer"><ExternalLink size={15}/>在 GitHub 打开</a>}</div>}
    {toast&&<div className="toast" role="status"><Check size={16}/>{toast}</div>}
    {(quickLook&&selected||help)&&<div className="modal-overlay" onMouseDown={e=>{if(e.target===e.currentTarget){setQuickLook(false);setHelp(false)}}}><div ref={dialogRef} className={`modal-content ${help?'help-modal':'quick-look'}`} role="dialog" tabIndex={-1} aria-modal="true" aria-label={help?'Peek 使用指南':`${selected?.name} 快速预览`}><div className="modal-header"><div><span className="modal-dot"/>{help?'一点指南，轻松上手':selected?.name}</div><div>{!help&&selected&&<button className="icon-button" aria-label="复制当前文件路径" title={copyPathFormat==='url'?'复制完整 GitHub 链接 (⌘ / Ctrl + C)':'复制仓库相对路径 (⌘ / Ctrl + C)'} onClick={()=>void copyPath(selected)}><Copy size={16}/></button>}{!help&&selected?.type==='file'&&<button className="icon-button" aria-label="下载当前文件" onClick={()=>void downloadFile(selected)}><Download size={17}/></button>}<button className="icon-button" aria-label="关闭预览" onClick={()=>{setQuickLook(false);setHelp(false)}}><X size={20}/></button></div></div>{help?<div className="help-content"><span className="help-eyebrow">HELLO, CURIOUS HUMAN.</span><h2>熟悉的操作，全新的发现。</h2><p>粘贴一个公开 GitHub 仓库链接，像浏览本地文件夹一样探索它。</p><div className="shortcut-list">{[['快速预览 / 关闭预览','空格'],['选择上一个 / 下一个文件','↑ ↓ ← →'],['打开文件 / 进入文件夹','Enter'],['选择多个文件','⌘ / Ctrl + 点击'],['连续选择','Shift + 点击'],['选择所有文件','⌘ / Ctrl + A'],['复制所选文件路径','⌘ / Ctrl + C'],['聚焦仓库链接','⌘ / Ctrl + K'],['搜索整个仓库','⌘ / Ctrl + F'],['返回上级目录','⌘ / Ctrl + ↑'],['关闭弹窗 / 恢复窗口','Esc']].map(([label,key])=><div key={label}><span>{label}</span><kbd>{key}</kbd></div>)}</div><div className="help-note"><Info size={17}/><p>支持公开仓库、分支和文件链接。网页以只读方式浏览，收藏保存在当前浏览器。GitHub 未登录 API 有调用额度；私有仓库、重命名和删除暂不支持。下载 ZIP 后，可在 Mac 上解压并用 Finder 打开。</p></div><button className="primary-button" onClick={()=>setHelp(false)}>开始探索<ArrowUpRight size={15}/></button></div>:selected&&<><div className="quick-look-body"><FilePreview key={`${repoId}/${selected.path}`} entry={selected} repository={repository} large onDownload={()=>void downloadFile(selected)}/></div><div className="quick-look-footer"><span>{selected.path}</span><span>{formatBytes(selected.size)}<kbd>←</kbd><kbd>→</kbd>切换文件</span></div></>}</div></div>}
  </div>
}
