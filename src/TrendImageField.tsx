import { useState } from 'react'
import { Image, X } from 'lucide-react'
import { uploadReferenceImage } from './uploadReferenceImage'

export default function TrendImageField({value,onChange,onNotice}:{value:string;onChange:(value:string)=>void;onNotice:(message:string)=>void}){
 const [uploading,setUploading]=useState(false),[error,setError]=useState('')
 const upload=async(file?:File)=>{if(!file)return;setUploading(true);setError('');try{onChange(await uploadReferenceImage(file));onNotice('Signal image uploaded')}catch(e){setError(e instanceof Error?e.message:'Could not upload image')}finally{setUploading(false)}}
 return <section className="trend-image-field"><div className="trend-image-field-head"><label className="field-label">Signal reference image</label><label className="meme-image-upload"><Image size={15}/>{uploading?'Uploading…':'Upload image'}<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" disabled={uploading} onChange={event=>{void upload(event.target.files?.[0]);event.currentTarget.value=''}}/></label></div><input className="field-input" value={value} onChange={event=>onChange(event.target.value)} placeholder="Paste an image URL or upload a file"/>{value?<div className="trend-image-preview"><img src={value} alt="Signal reference preview"/><button type="button" className="subtle-icon" onClick={()=>onChange('')} aria-label="Remove signal image"><X size={15}/></button></div>:<div className="meme-image-empty"><Image size={19}/><span>No reference image selected</span></div>}{error&&<small className="trend-image-error">{error}</small>}</section>
}
