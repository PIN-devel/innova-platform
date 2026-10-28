import type {ReactNode} from 'react';
import {NavLink,Outlet,useLocation} from 'react-router';
import {House,ChartNoAxesCombined,CalendarDays} from 'lucide-react';
import {selectedReviewMonth} from '@/shared/lib/finance-month';
import '@/shared/ui/motifin/motifin.css';
const tabs=[{path:'review',label:'월간 리뷰',Icon:House},{path:'analysis',label:'소비 분석',Icon:ChartNoAxesCombined},{path:'schedule',label:'자금 일정',Icon:CalendarDays}];
export function MotifinContentLayout({children}:{children?:ReactNode}){const location=useLocation();let month:string;try{month=selectedReviewMonth('https://local'+location.pathname+location.search);}catch{month=selectedReviewMonth('https://local');}return <main id="main-content" className="motifin mf-main mf-live"><div className="mf-workspace">{children??<Outlet/>}</div><nav className="mf-bottom-nav" aria-label="MOTIFIN 주요 탐색">{tabs.map(({path,label,Icon})=><NavLink key={path} to={`/motifin/${path}?month=${month}`} className={({isActive})=>isActive||path==='analysis'&&location.pathname==='/motifin/spending'?'mf-tab is-active':'mf-tab'}><Icon size={21} aria-hidden="true"/><span>{label}</span></NavLink>)}</nav></main>;}
