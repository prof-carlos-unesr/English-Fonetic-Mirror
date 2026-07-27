import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { 
  Play, Pause, Square, Moon, Sun, 
  Activity, Languages, Upload, SkipBack, SkipForward, Volume2, Clipboard, ChevronDown, ChevronUp
} from 'lucide-react';

/**
 * ESPEJO FONÉTICO v2.7.5 - CAPARAZÓN PRO (FIXED)
 * Motor: Micro-Sync v2.6.8 (12-word chunks)
 * UI: Soporte PDF/Word, Salto Temporal Real ±5s, Panel de Pegado Rápido.
 * Firma: By prof.carlos.unesr@gmail.com
 */

const DEFAULT_TEXT = `Welcome to the Phonetic Mirror v2.7.5.

This version features a more precise time-skip navigation. When you press forward or backward, it calculates the exact number of words corresponding to five seconds.

You can also use the new "Paste Text" feature in the sidebar for large documents.`;

const App = () => {
  const [darkMode, setDarkMode] = useState(false);
  const [fileName, setFileName] = useState("Bienvenida.txt");
  const [fullText, setFullText] = useState(DEFAULT_TEXT);
  const [voices, setVoices] = useState([]);
  const [selectedVoiceURI, setSelectedVoiceURI] = useState("");
  const [fineRate, setFineRate] = useState(1); 
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const [currentWordIndex, setCurrentWordIndex] = useState(-1);
  const [isExtracting, setIsExtracting] = useState(false);
  const [showPasteArea, setShowPasteArea] = useState(false);
  const [pastedText, setPastedText] = useState("");

  const synth = typeof window !== 'undefined' ? window.speechSynthesis : null;
  const activeWordRef = useRef(null);
  const startTimeRef = useRef(0);
  const timerRef = useRef(null);
  const lastBoundaryIndex = useRef(0);

  // --- MOTOR FONÉTICO (PRESERVADO v2.6.8) ---
  const wordArrays = useMemo(() => {
    if (!fullText) return { english: [], phonetic: [] };
    const phoneticsMap = [
      [/\bthe\b/gi, "da"], [/\bthought\b/gi, "zot"], [/\bmachine\b/gi, "mashín"],
      [/\bread\b/gi, "rid"], [/\bcome\b/gi, "kam"], [/\bin\b/gi, "in"],
      [/\bit\b/gi, "it"], [/\band\b/gi, "and"], [/\bof\b/gi, "ov"],
      [/\btouch\b/gi, "tach"], [/\bthrough\b/gi, "zru"], [/\benough\b/gi, "enaf"],
      [/\bright\b/gi, "rait"], [/\bnight\b/gi, "nait"], [/\bphone\b/gi, "fóun"],
      [/\bhello\b/gi, "jelóu"], [/\btion\b/gi, "shon"], [/\bsh/gi, "sh"],
      [/\bch/gi, "ch"], [/oo/gi, "u"], [/ee/gi, "i"], [/ea/gi, "i"],
      [/igh/gi, "ai"], [/ay\b/gi, "ei"], [/ow\b/gi, "au"], [/ph/gi, "f"],
      [/th/gi, "z"], [/ck/gi, "k"], [/kn/gi, "n"], [/wr/gi, "r"],
    ];
    const rawParts = fullText.split(/(\s+)/).filter(p => p.length > 0);
    const englishParts = [];
    const phoneticParts = [];
    rawParts.forEach(part => {
      englishParts.push(part);
      if (/^\s+$/.test(part)) { phoneticParts.push(part); } else {
        let p = part.toLowerCase().replace(/[^a-z'áéíóúñ]/gi, '');
        if (!p) { phoneticParts.push(part); } else {
          phoneticsMap.forEach(([regex, replacement]) => { p = p.replace(regex, replacement); });
          phoneticParts.push(p);
        }
      }
    });
    return { english: englishParts, phonetic: phoneticParts };
  }, [fullText]);

  // --- NAVEGACIÓN TEMPORAL REAL (±5s) ---
  const skipTime = (seconds) => {
    const wordsPerSecond = 2.5 * fineRate; 
    const wordsToSkip = Math.round(seconds * wordsPerSecond);
    
    let targetIndex = currentWordIndex + wordsToSkip;
    targetIndex = Math.max(0, Math.min(targetIndex, wordArrays.english.length - 1));
    
    setCurrentWordIndex(targetIndex);
    startReading(targetIndex);
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setFileName(file.name);
    setIsExtracting(true);
    try {
      if (file.type === "text/plain") {
        setFullText(await file.text());
      } else if (file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
        const arrayBuffer = await file.arrayBuffer();
        const result = await window.mammoth.convertToPlainText({ arrayBuffer });
        setFullText(result.value);
      } else if (file.type === "application/pdf") {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        let fullPdfText = "";
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const content = await page.getTextContent();
          fullPdfText += content.items.map(item => item.str).join(" ") + "\n";
        }
        setFullText(fullPdfText);
      }
      stopReading();
    } catch (err) { console.error(err); } finally { setIsExtracting(false); }
  };

  const handlePasteProcess = () => {
    if (!pastedText.trim()) return;
    setFullText(pastedText);
    setFileName("Texto Pegado.txt");
    setPastedText("");
    setShowPasteArea(false);
    stopReading();
  };

  const loadVoices = useCallback(() => {
    if (!synth) return;
    const v = synth.getVoices();
    const englishVoices = v.filter(voice => voice.lang.startsWith('en'));
    setVoices(englishVoices.length > 0 ? englishVoices : v);
    if (v.length > 0 && !selectedVoiceURI) {
      const preferred = v.find(voice => voice.lang.startsWith('en-US')) || v.find(voice => voice.lang.startsWith('en')) || v[0];
      setSelectedVoiceURI(preferred.voiceURI);
    }
  }, [synth, selectedVoiceURI]);

  useEffect(() => {
    loadVoices();
    if (synth && (synth.onvoiceschanged !== undefined)) synth.onvoiceschanged = loadVoices;
    const scripts = [
      "https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js",
      "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"
    ];
    scripts.forEach(src => {
      if (!document.querySelector(`script[src="${src}"]`)) {
        const s = document.createElement('script'); s.src = src; document.head.appendChild(s);
        if(src.includes('pdf.min.js')) s.onload = () => { window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'; };
      }
    });
    return () => { if (synth) synth.cancel(); };
  }, [loadVoices, synth]);

  useEffect(() => {
    if (autoScroll && activeWordRef.current) {
      activeWordRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [currentWordIndex, autoScroll]);

  const getNextChunkEnd = (startIndex) => {
    const CHUNK_SIZE = 12; 
    let end = Math.min(startIndex + CHUNK_SIZE, wordArrays.english.length);
    for (let i = end; i > startIndex + 2; i--) {
      if (wordArrays.english[i] && /[.!?\n]/.test(wordArrays.english[i])) return i + 1;
    }
    return end;
  };

  const startReading = (startIndex = 0) => {
    if (!fullText || !synth) return;
    synth.cancel();
    if (timerRef.current) clearInterval(timerRef.current);
    lastBoundaryIndex.current = 0; 
    setIsPaused(false);
    const chunkEnd = getNextChunkEnd(startIndex);
    const wordsToSpeak = wordArrays.english.slice(startIndex, chunkEnd);
    const textToSpeak = wordsToSpeak.join("");
    if (!textToSpeak.trim()) { setIsPlaying(false); return; }

    const utterance = new SpeechSynthesisUtterance(textToSpeak);
    const voice = voices.find(v => v.voiceURI === selectedVoiceURI);
    if (voice) utterance.voice = voice;
    utterance.rate = fineRate;

    utterance.onboundary = (event) => {
      if (event.name === 'word') {
        const charIndex = event.charIndex;
        lastBoundaryIndex.current = charIndex;
        let cumulative = 0;
        for (let i = startIndex; i < chunkEnd; i++) {
          const wordLen = wordArrays.english[i].length;
          if (charIndex >= cumulative && charIndex < cumulative + wordLen) {
            setCurrentWordIndex(i);
            break;
          }
          cumulative += wordLen;
        }
      }
    };

    utterance.onstart = () => {
      setIsPlaying(true);
      startTimeRef.current = Date.now();
      let lastEstimatedIdx = -1;
      timerRef.current = setInterval(() => {
        const elapsed = (Date.now() - startTimeRef.current) / 1000;
        const charsPerSecond = 13.5 * fineRate; 
        const estimatedCharPos = Math.max(0, (elapsed * charsPerSecond) - 0.2);
        const safeTarget = Math.max(estimatedCharPos, lastBoundaryIndex.current);
        let cumulative = 0;
        for (let i = startIndex; i < chunkEnd; i++) {
            cumulative += wordArrays.english[i].length;
            if (safeTarget < cumulative) {
                if (i !== lastEstimatedIdx && i > currentWordIndex) {
                    setCurrentWordIndex(i);
                    lastEstimatedIdx = i;
                }
                break;
            }
        }
      }, 80);
    };
    
    utterance.onend = () => {
      clearInterval(timerRef.current);
      if (chunkEnd < wordArrays.english.length && !isPaused) {
        setTimeout(() => startReading(chunkEnd), 10); 
      } else {
        if (!isPaused) { setIsPlaying(false); setCurrentWordIndex(-1); }
      }
    };
    synth.speak(utterance);
  };

  const stopReading = () => {
    if (synth) synth.cancel();
    if (timerRef.current) clearInterval(timerRef.current);
    setIsPlaying(false); setIsPaused(false);
    setCurrentWordIndex(-1);
  };

  const pauseReading = () => {
    if (synth) { 
      synth.cancel(); 
      if (timerRef.current) clearInterval(timerRef.current);
      setIsPaused(true); 
      setIsPlaying(false); 
    }
  };

  const renderPanel = (isPhonetic = false) => {
    const words = isPhonetic ? wordArrays.phonetic : wordArrays.english;
    return (
      <div className="flex flex-wrap items-baseline content-start">
        {words.map((word, idx) => {
          const isActive = idx === currentWordIndex;
          const isSpace = /^\s+$/.test(word);
          if (isSpace) return <span key={idx} className="whitespace-pre">{word}</span>;
          return (
            <span 
              key={idx}
              ref={isActive && !isPhonetic ? activeWordRef : null}
              className={`inline-block px-1 rounded-md transition-all duration-150 ${
                isActive 
                ? (isPhonetic 
                    ? "bg-amber-400 text-black font-bold shadow-[0_0_25px_rgba(251,191,36,1)] scale-110 z-20" 
                    : "bg-indigo-600 text-white font-bold shadow-[0_0_25px_rgba(79,70,229,1)] scale-110 z-20")
                : "opacity-80 hover:opacity-100 hover:bg-slate-200 dark:hover:bg-slate-800 cursor-pointer"
              }`}
              onClick={() => { setCurrentWordIndex(idx); startReading(idx); }}
            >
              {word}
            </span>
          );
        })}
      </div>
    );
  };

  return (
    <div className={`flex flex-col h-screen ${darkMode ? 'bg-slate-950 text-slate-100' : 'bg-slate-50 text-slate-900'} font-sans overflow-hidden transition-colors`}>
      <header className={`flex items-center justify-between px-6 py-4 border-b ${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-md'}`}>
        <div className="flex items-center gap-4">
          <div className="p-2 bg-indigo-600 text-white rounded-2xl shadow-xl"><Languages size={28} /></div>
          <div>
            <h1 className="text-2xl font-black italic text-indigo-600 dark:text-indigo-400 tracking-tighter leading-none uppercase">Espejo Fonético</h1>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] mt-1">{isExtracting ? "Procesando contenido..." : fileName}</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <button onClick={() => synth && synth.speak(new SpeechSynthesisUtterance(""))} className="p-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-indigo-600 transition-all" title="Activar Audio">
            <Volume2 size={22} />
          </button>
          <select 
            className={`text-xs font-bold p-3 rounded-xl border appearance-none cursor-pointer outline-none ${darkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-slate-100 border-slate-200'}`}
            value={selectedVoiceURI} 
            onChange={(e) => setSelectedVoiceURI(e.target.value)}
          >
            {voices.map(v => <option key={v.voiceURI} value={v.voiceURI}>{v.name}</option>)}
          </select>
          <button onClick={() => setDarkMode(!darkMode)} className="p-3 rounded-xl bg-indigo-50 dark:bg-slate-800 text-indigo-600 dark:text-yellow-400 hover:rotate-12 transition-all">
            {darkMode ? <Sun size={22} /> : <Moon size={22} />}
          </button>
        </div>
      </header>

      <main className="flex-1 flex overflow-hidden">
        <aside className={`w-80 border-r p-6 hidden md:flex flex-col gap-6 overflow-y-auto custom-scrollbar ${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'}`}>
          <div className="space-y-4">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Métodos de Entrada</label>
            
            <div className="space-y-2">
              <button 
                onClick={() => setShowPasteArea(!showPasteArea)}
                className={`w-full flex items-center justify-between p-4 rounded-2xl border transition-all ${showPasteArea ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-indigo-400'}`}
              >
                <div className="flex items-center gap-3">
                  <Clipboard size={18} />
                  <span className="text-[11px] font-bold uppercase">Pegar Texto</span>
                </div>
                {showPasteArea ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </button>
              
              {showPasteArea && (
                <div className="space-y-3 animate-in fade-in slide-in-from-top-2 duration-300">
                  <textarea 
                    value={pastedText}
                    onChange={(e) => setPastedText(e.target.value)}
                    placeholder="Pega aquí tu texto (PDFs, artículos, correos...)"
                    className={`w-full h-48 p-4 text-xs rounded-2xl border resize-none focus:ring-2 focus:ring-indigo-500 outline-none ${darkMode ? 'bg-slate-950 border-slate-700 text-slate-300' : 'bg-white border-slate-200'}`}
                  />
                  <button 
                    onClick={handlePasteProcess}
                    className="w-full py-3 bg-indigo-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-indigo-700 transition-colors shadow-lg"
                  >
                    Procesar Texto
                  </button>
                </div>
              )}
            </div>

            <label className="group flex flex-col items-center justify-center border-2 border-dashed rounded-[2rem] p-8 cursor-pointer hover:border-indigo-500 hover:bg-indigo-50/30 transition-all border-slate-300 dark:border-slate-700">
               <Upload size={32} className="text-indigo-500 mb-2 group-hover:-translate-y-1 transition-transform" />
               <span className="text-[10px] font-bold text-slate-500 uppercase text-center">PDF o TXT</span>
               <input type="file" onChange={handleFileUpload} className="hidden" accept=".txt,.docx,.pdf" />
            </label>
          </div>
          
          <div className="space-y-6">
            <div className="flex justify-between items-center">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Velocidad</label>
                <span className="px-2 py-1 bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400 rounded-md text-xs font-black">{fineRate}x</span>
            </div>
            <input type="range" min="0.5" max="2" step="0.1" value={fineRate} onChange={e => setFineRate(parseFloat(e.target.value))} className="w-full accent-indigo-600 h-2 rounded-lg appearance-none cursor-pointer bg-slate-200 dark:bg-slate-700" />
          </div>

          <div className="mt-auto bg-indigo-600 text-white p-6 rounded-[2rem] shadow-xl">
             <div className="flex items-center gap-3 mb-2">
                <Activity size={20} className="animate-pulse" />
                <p className="text-[10px] font-black uppercase tracking-widest text-indigo-100">PRO-CONSOLE v2.7.5</p>
             </div>
             <p className="text-[11px] font-medium opacity-90 italic text-center leading-relaxed">"Navegación temporal precisa y entrada de datos extendida."</p>
             <p className="text-[11px] font-medium opacity-90 italic text-center leading-relaxed">"Usar mejor en la PC. De usar en el móvil, asegúrese de configurar antes la opción texto to speech (TTS) en English (United State) para que no se cuelen sonidos en español."</p>
             <div className="mt-4 pt-4 border-t border-indigo-400 text-center">
                <p className="text-[9px] font-bold tracking-widest opacity-80 uppercase leading-loose">By prof.carlos.unesr@gmail.com</p>
             </div>
          </div>
        </aside>

        <div className="flex-1 overflow-y-auto p-6 md:p-12 custom-scrollbar bg-slate-50 dark:bg-slate-950">
          <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-12 min-h-full">
            <section className={`p-10 rounded-[3.5rem] border shadow-2xl transition-all h-fit ${darkMode ? 'bg-slate-900/90 border-slate-800 shadow-indigo-500/5' : 'bg-white border-slate-100'}`}>
              <h3 className="text-[10px] font-black text-indigo-500 uppercase tracking-[0.4em] mb-12 flex items-center gap-4">
                <span className="w-8 h-1 bg-indigo-500 rounded-full"></span>
                TEXTO ORIGINAL
              </h3>
              <div className="text-xl md:text-2xl leading-[2.6] font-medium">{renderPanel(false)}</div>
            </section>
            
            <section className={`p-10 rounded-[3.5rem] border shadow-2xl transition-all h-fit ${darkMode ? 'bg-slate-900/90 border-slate-800 shadow-amber-500/5' : 'bg-white border-slate-100'}`}>
              <h3 className="text-[10px] font-black text-amber-500 uppercase tracking-[0.4em] mb-12 flex items-center gap-4">
                <span className="w-8 h-1 bg-amber-500 rounded-full"></span>
                SONIDO ESPAÑOL
              </h3>
              <div className="text-xl md:text-2xl leading-[2.6] font-mono italic text-slate-600 dark:text-slate-300">{renderPanel(true)}</div>
            </section>
          </div>
        </div>
      </main>

      <footer className={`border-t p-10 ${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-[0_-10px_40px_rgba(0,0,0,0.05)]'}`}>
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-8">
          
          <div className="flex items-center gap-6">
            <button 
              onClick={() => skipTime(-5)} 
              className="p-4 text-slate-400 hover:text-indigo-600 transition-all hover:bg-indigo-50 dark:hover:bg-slate-800 rounded-2xl flex flex-col items-center gap-1" 
              title="Atrás 5s"
            >
                <SkipBack size={24} />
                <span className="text-[8px] font-black">5s</span>
            </button>
            
            <button onClick={stopReading} className="text-slate-400 hover:text-red-500 transition-all hover:scale-110"><Square size={28} fill="currentColor" /></button>
            
            {!isPlaying || isPaused ? (
              <button onClick={() => startReading(currentWordIndex > 0 ? currentWordIndex : 0)} className="p-10 bg-indigo-600 text-white rounded-[3rem] shadow-[0_25px_60px_-15px_rgba(79,70,229,0.6)] hover:scale-105 active:scale-95 transition-all"><Play size={48} fill="white" /></button>
            ) : (
              <button onClick={pauseReading} className="p-10 bg-amber-500 text-white rounded-[3rem] shadow-[0_25px_60px_-15px_rgba(245,158,11,0.6)] hover:scale-105 active:scale-95 transition-all"><Pause size={48} fill="white" /></button>
            )}

            <button 
              onClick={() => skipTime(5)} 
              className="p-4 text-slate-400 hover:text-indigo-600 transition-all hover:bg-indigo-50 dark:hover:bg-slate-800 rounded-2xl flex flex-col items-center gap-1" 
              title="Adelante 5s"
            >
                <SkipForward size={24} />
                <span className="text-[8px] font-black">5s</span>
            </button>
          </div>

          <div className="flex flex-col items-center md:items-end gap-3">
             <div className="flex items-center gap-4">
                 <button onClick={() => setAutoScroll(!autoScroll)} className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all font-bold text-[10px] uppercase tracking-widest ${autoScroll ? 'bg-indigo-600 text-white shadow-lg' : 'bg-slate-200 dark:bg-slate-800 text-slate-500'}`}>
                    <Activity size={16}/> {autoScroll ? 'Seguimiento ON' : 'Seguimiento OFF'}
                 </button>
                 <div className={`w-3 h-3 rounded-full ${isPlaying ? 'bg-green-500 animate-ping' : 'bg-slate-300'}`}></div>
             </div>
             <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] italic">By prof.carlos.unesr@gmail.com</p>
          </div>
        </div>
      </footer>
      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 8px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #6366f122; border-radius: 20px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #6366f144; }
      `}</style>
    </div>
  );
};

export default App;
