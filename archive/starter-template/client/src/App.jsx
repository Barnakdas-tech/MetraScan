import {useEffect,useState} from "react";
export default function App(){
  const [health,setHealth]=useState("checking...");
  const [rules,setRules]=useState([]);
  useEffect(()=>{
    fetch("http://localhost:5000/api/health").then(r=>r.json()).then(d=>setHealth(d.status)).catch(()=>setHealth("offline"));
    fetch("http://localhost:5000/api/rules").then(r=>r.json()).then(d=>setRules(d.rules||[])).catch(()=>{});
  },[]);
  return <main className="container">
    <p className="eyebrow">SIH26034</p>
    <h1>MetraScan</h1>
    <p className="subtitle">AI-assisted packaged-commodity compliance inspection</p>
    <section className="card"><h2>System status</h2><p>Backend: <b>{health}</b></p><p>Legal catalog: <b>{rules.length} entries</b></p></section>
    <section className="card"><h2>Pipeline</h2><ol>{["Upload package images","Image quality","OCR + QR","Structured extraction","Applicability engine","Deterministic rule validation","Evidence + result","Report"].map(x=><li key={x}>{x}</li>)}</ol></section>
    <section className="card warning"><h2>Legal safety</h2><p>Insufficient evidence produces REVIEW or MANUAL_REQUIRED instead of an invented legal conclusion.</p></section>
  </main>;
}
