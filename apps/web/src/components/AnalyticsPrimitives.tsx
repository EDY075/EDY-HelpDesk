import { useState } from 'react';
import { CalendarDays } from 'lucide-react';
import type { DateRangeSelection } from '../lib/api';
import { formatNumber } from '../i18n/I18nProvider';

export function DateRangeFilter({ value, onChange }: { value: DateRangeSelection; onChange: (value: DateRangeSelection) => void }) {
  const [from,setFrom]=useState(value.from??'');const [to,setTo]=useState(value.to??'');
  const presets=[['today','Today'],['7d','7 Days'],['30d','30 Days'],['custom','Custom']] as const;
  return <div className="date-range" aria-label="Analytics date range"><div className="segmented">{presets.map(([key,label])=><button className={value.range===key?'active':''} type="button" aria-pressed={value.range===key} key={key} onClick={()=>onChange(key==='custom'?{range:key,from,to}:{range:key})}>{label}</button>)}</div>{value.range==='custom'?<div className="date-range__custom"><label><span>From</span><input aria-label="Start date" type="date" value={from} onChange={event=>setFrom(event.target.value)} /></label><label><span>To</span><input aria-label="End date" type="date" value={to} onChange={event=>setTo(event.target.value)} /></label><button className="button button--secondary" type="button" disabled={!from||!to||from>to} onClick={()=>onChange({range:'custom',from,to})}>Apply</button></div>:null}<small><CalendarDays size={13} aria-hidden="true" />America/Sao_Paulo · stored in UTC</small></div>;
}

export function MetricCard({ label, value, suffix, tone='neutral' }: { label:string; value:number|null; suffix?:string; tone?:'primary'|'success'|'warning'|'critical'|'neutral' }) {
  return <article className={`analytics-metric analytics-metric--${tone}`}><span>{label}</span><strong>{value===null?'No data available':`${formatNumber(value)}${suffix??''}`}</strong></article>;
}

export function BarChart({ title, description, data, tone='primary' }: { title:string; description:string; data:Array<{label:string;value:number}>; tone?:'primary'|'secondary'|'success'|'warning'|'critical'|'neutral' }) {
  const max=Math.max(1,...data.map(item=>item.value));
  return <figure className="chart-card panel" aria-label={`${title}. ${description}`}><figcaption><strong>{title}</strong><span>{description}</span></figcaption>{data.length?<div className="bar-chart">{data.map(item=><div className="bar-chart__row" key={item.label}><span title={item.label}>{item.label}</span><div aria-hidden="true"><i className={`chart-tone--${tone}`} style={{width:`${Math.max(item.value?4:0,(item.value/max)*100)}%`}} /></div><strong>{item.value}</strong></div>)}</div>:<p className="chart-empty">No data available for this range.</p>}<table className="sr-only"><caption>{title}</caption><tbody>{data.map(item=><tr key={item.label}><th>{item.label}</th><td>{item.value}</td></tr>)}</tbody></table></figure>;
}
