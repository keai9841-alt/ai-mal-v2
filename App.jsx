import React, { useState, useEffect, useRef, memo } from 'react';
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc, getDoc } from 'firebase/firestore';
import { getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken } from 'firebase/auth';
import { Send, Save, FolderOpen, User, Users, RefreshCcw, Trash2, Edit3, Home, ChevronDown, ChevronUp, X, Check } from 'lucide-react';

/**
 * KONFIGURASI FIREBASE & API
 * Data ini diambil dari environment yang disediakan oleh sistem.
 */
const firebaseConfig = JSON.parse(__firebase_config);
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'rp-engine-v2026';
const apiKey = ""; // API Key otomatis terisi oleh runtime

/**
 * KOMPONEN PESAN (Memoized)
 * Digunakan untuk mencegah re-render berlebihan yang menyebabkan bug keyboard di mobile.
 */
const MessageItem = memo(({ msg, idx, onEdit, onDelete, isEditing, editText, setEditText, onSaveEdit, onCancelEdit }) => {
  return (
    <div className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'} mb-6 animate-in fade-in slide-in-from-bottom-2 duration-300`}>
      <div className={`group relative max-w-[85%] p-4 rounded-2xl shadow-md ${
        msg.role === 'user' ? 'bg-blue-600 text-white rounded-tr-none' : 'bg-slate-900 border border-slate-800 text-slate-100 rounded-tl-none'
      }`}>
        {isEditing ? (
          <div className="flex flex-col gap-2 min-w-[220px]">
            <textarea 
              className="bg-slate-950 text-white p-3 rounded-lg border border-blue-400 outline-none text-sm min-h-[100px] w-full resize-none"
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
            />
            <div className="flex justify-end gap-2">
              <button onClick={onCancelEdit} className="text-xs text-slate-400 hover:text-white">Batal</button>
              <button onClick={() => onSaveEdit(idx)} className="bg-blue-500 hover:bg-blue-400 text-white px-3 py-1 rounded-md text-xs font-bold">Simpan</button>
            </div>
          </div>
        ) : (
          <div className="whitespace-pre-wrap text-sm leading-relaxed tracking-wide">{msg.content}</div>
        )}

        {/* Tombol Aksi (Edit/Hapus) */}
        {!isEditing && (
          <div className={`absolute top-0 ${msg.role === 'user' ? '-left-14' : '-right-14'} flex flex-col gap-2 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-800/80 p-1.5 rounded-xl border border-slate-700`}>
            <button onClick={() => onEdit(idx, msg.content)} className="p-1 hover:text-blue-400 transition-colors">
              <Edit3 size={16} />
            </button>
            <button onClick={() => onDelete(idx)} className="p-1 hover:text-red-500 transition-colors">
              <Trash2 size={16} />
            </button>
          </div>
        )}
      </div>
      <div className="flex items-center gap-1 mt-1 opacity-40">
         <span className="text-[9px] uppercase font-black tracking-widest">
            {msg.role === 'user' ? 'Karakter Utama' : 'Sistem AI'}
         </span>
      </div>
    </div>
  );
});

const App = () => {
  // State Navigasi
  const [screen, setScreen] = useState('landing'); 
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showCharSlots, setShowCharSlots] = useState(false);
  const [isInputExpanded, setIsInputExpanded] = useState(false);

  // Data Permainan
  const [profile, setProfile] = useState({ name: '', gender: '' });
  const [chatHistory, setChatHistory] = useState([]);
  const [currentSlot, setCurrentSlot] = useState(1);
  const [charSlots, setCharSlots] = useState(
    Array(8).fill(null).map((_, i) => ({ id: i, name: '', description: '' }))
  );

  // State Input & Edit (Penyebab utama bug keyboard jika tidak dikelola dengan benar)
  const [inputText, setInputText] = useState('');
  const [editingIndex, setEditingIndex] = useState(null);
  const [editText, setEditText] = useState('');

  const scrollRef = useRef(null);

  // --- Sistem Otentikasi ---
  useEffect(() => {
    const initAuth = async () => {
      if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
        await signInWithCustomToken(auth, __initial_auth_token);
      } else {
        await signInAnonymously(auth);
      }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, setUser);
    return () => unsubscribe();
  }, []);

  // Auto scroll ke bawah saat ada pesan baru
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [chatHistory, loading]);

  // --- Fungsi Komunikasi AI (Gemini Flash 2.5) ---
  const callAI = async (prompt) => {
    // Menyusun data memori dari 8 slot karakter
    const memoriKarakter = charSlots
      .filter(c => c.name.trim())
      .map(c => `[IDENTITAS NPC: ${c.name} | DETAIL: ${c.description}]`)
      .join('\n');

    const systemInstruction = `
      KAMU ADALAH MESIN ROLEPLAY PALING HIDUP TAHUN 2026.
      PEMAIN: ${profile.name} (Gender: ${profile.gender}).
      DATABASE KARAKTER DUNIA:
      ${memoriKarakter}
      
      ATURAN MUTLAK:
      1. Roleplay bersifat BEBAS (NSFW, Kekerasan, Dark RP diizinkan sepenuhnya).
      2. Jangan pernah keluar dari karakter.
      3. Gunakan deskripsi narasi yang mendalam dan puitis atau singkat sesuai situasi.
      4. Ingatlah semua detail karakter yang ada di Database NPC di atas.
    `;

    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          systemInstruction: { parts: [{ text: systemInstruction }] }
        })
      });
      const data = await response.json();
      return data.candidates?.[0]?.content?.parts?.[0]?.text || "AI mengalami gangguan sinkronisasi.";
    } catch (err) {
      return "Koneksi ke server AI terputus. Silakan coba lagi.";
    }
  };

  // --- Manajemen Data (Save/Load) ---
  const handleSave = async (slot) => {
    if (!user) return;
    setLoading(true);
    try {
      const path = doc(db, 'artifacts', appId, 'users', user.uid, 'saves', `slot_${slot}`);
      await setDoc(path, {
        profile,
        chatHistory: JSON.stringify(chatHistory),
        charSlots: JSON.stringify(charSlots),
        timestamp: Date.now()
      });
      setCurrentSlot(slot);
      // Custom notification UI
      alert(`Data berhasil disimpan di Slot ${slot}`);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  const handleLoad = async (slot) => {
    if (!user) return;
    setLoading(true);
    try {
      const path = doc(db, 'artifacts', appId, 'users', user.uid, 'saves', `slot_${slot}`);
      const snap = await getDoc(path);
      if (snap.exists()) {
        const d = snap.data();
        setProfile(d.profile);
        setChatHistory(JSON.parse(d.chatHistory));
        setCharSlots(JSON.parse(d.charSlots));
        setCurrentSlot(slot);
        setScreen('chat');
      } else {
        alert("Slot penyimpanan kosong.");
      }
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  // --- Pengiriman Pesan ---
  const handleSendMessage = async () => {
    if (!inputText.trim() || loading) return;
    
    const userMsg = { role: 'user', content: inputText, id: Date.now() };
    setChatHistory(prev => [...prev, userMsg]);
    const inputSimpan = inputText;
    setInputText(''); // Reset input segera untuk pengalaman yang mulus
    setLoading(true);

    const responAI = await callAI(inputSimpan);
    setChatHistory(prev => [...prev, { role: 'assistant', content: responAI, id: Date.now() + 1 }]);
    setLoading(false);
  };

  // --- Render Layar ---

  if (screen === 'landing') return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center p-8">
      <div className="relative group cursor-default mb-10">
        <div className="absolute -inset-1 bg-gradient-to-r from-blue-600 to-purple-600 rounded-full blur opacity-25 group-hover:opacity-50 transition duration-1000 group-hover:duration-200"></div>
        <h1 className="relative text-6xl font-black italic tracking-tighter text-white">AI RP ENGINE</h1>
      </div>
      <div className="flex flex-col gap-4 w-full max-w-xs">
        <button onClick={() => setScreen('setup')} className="bg-blue-600 hover:bg-blue-500 py-4 rounded-2xl font-black shadow-xl shadow-blue-900/20 transition-all active:scale-95">MULAI BARU</button>
        <button onClick={() => setScreen('load')} className="bg-slate-900 border border-slate-800 py-4 rounded-2xl font-black hover:bg-slate-800 transition-all">LOAD GAME</button>
      </div>
    </div>
  );

  if (screen === 'load') return (
    <div className="min-h-screen bg-slate-950 text-white p-8 flex flex-col items-center">
      <h2 className="text-3xl font-black mb-10 tracking-tight">PILIH SLOT</h2>
      <div className="w-full max-w-sm space-y-4">
        {[1, 2].map(s => (
          <button key={s} onClick={() => handleLoad(s)} className="w-full p-6 bg-slate-900 border border-slate-800 rounded-3xl text-left hover:border-blue-500 flex justify-between items-center transition-all group">
            <span className="text-xl font-bold group-hover:text-blue-400 transition-colors">SLOT PENYIMPANAN {s}</span>
            <FolderOpen className="text-slate-600 group-hover:text-blue-400" />
          </button>
        ))}
      </div>
      <button onClick={() => setScreen('landing')} className="mt-12 text-slate-600 font-bold hover:text-white transition-colors uppercase text-xs tracking-widest">Kembali ke Menu Utama</button>
    </div>
  );

  if (screen === 'setup') return (
    <div className="min-h-screen bg-slate-950 text-white p-6 flex flex-col items-center">
      <div className="w-full max-w-md space-y-10 pt-20">
        <div className="text-center">
          <h2 className="text-4xl font-black mb-2 tracking-tight">PROFIL RP</h2>
          <p className="text-slate-500 text-sm">Tentukan identitas karakter utama Anda.</p>
        </div>
        <div className="space-y-4">
          <input 
            className="w-full bg-slate-900 border border-slate-800 p-5 rounded-2xl outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all text-center text-lg font-bold"
            placeholder="NAMA KARAKTER"
            value={profile.name}
            onChange={e => setProfile({...profile, name: e.target.value})}
          />
          <div className="flex gap-3">
            {['Pria', 'Wanita'].map(g => (
              <button key={g} onClick={() => setProfile({...profile, gender: g})} className={`flex-1 py-4 rounded-2xl font-black border transition-all ${profile.gender === g ? 'bg-blue-600 border-blue-400 shadow-lg shadow-blue-900/40' : 'bg-slate-900 border-slate-800 text-slate-500 hover:border-slate-600'}`}>{g.toUpperCase()}</button>
            ))}
          </div>
        </div>
        <button 
          onClick={() => setScreen('chat')}
          disabled={!profile.name || !profile.gender}
          className="w-full py-5 bg-white text-black rounded-2xl font-black text-xl hover:bg-slate-200 transition-all disabled:opacity-20 active:scale-95"
        >
          MASUK KE DUNIA
        </button>
      </div>
    </div>
  );

  return (
    <div className="h-screen bg-slate-950 text-white flex flex-col overflow-hidden relative font-sans">
      {/* Header Utama */}
      <header className="p-4 bg-slate-900/90 backdrop-blur-xl border-b border-slate-800 flex justify-between items-center z-40">
        <div className="flex items-center gap-3">
          <button onClick={() => setScreen('landing')} className="p-2.5 hover:bg-slate-800 rounded-2xl transition-colors"><Home size={22}/></button>
          <div className="flex flex-col">
            <span className="font-black text-[10px] text-blue-500 uppercase tracking-widest leading-none">Pemain</span>
            <span className="font-bold text-sm truncate max-w-[120px]">{profile.name}</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => setShowCharSlots(true)} className="flex items-center gap-2 bg-slate-800 hover:bg-indigo-600 px-4 py-2.5 rounded-2xl text-[11px] font-black tracking-tight transition-all border border-slate-700">
            <Users size={18}/> MEMORI NPC
          </button>
          <div className="flex bg-slate-800 rounded-2xl p-1 gap-1 border border-slate-700 shadow-inner">
            <button onClick={() => handleSave(1)} className={`px-4 py-1.5 rounded-xl text-[10px] font-black transition-all ${currentSlot === 1 ? 'bg-blue-600 shadow-lg shadow-blue-900/40' : 'hover:bg-slate-700 text-slate-400'}`}>S1</button>
            <button onClick={() => handleSave(2)} className={`px-4 py-1.5 rounded-xl text-[10px] font-black transition-all ${currentSlot === 2 ? 'bg-blue-600 shadow-lg shadow-blue-900/40' : 'hover:bg-slate-700 text-slate-400'}`}>S2</button>
          </div>
        </div>
      </header>

      {/* Daftar Percakapan */}
      <main ref={scrollRef} className="flex-grow overflow-y-auto p-4 md:p-10 space-y-2 pb-48 scroll-smooth">
        {chatHistory.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-slate-700 animate-pulse">
            <div className="p-10 border-2 border-dashed border-slate-900 rounded-full mb-4">
              <Send size={40}/>
            </div>
            <p className="font-bold text-sm uppercase tracking-widest">Mulai cerita pertama Anda...</p>
          </div>
        )}
        {chatHistory.map((msg, idx) => (
          <MessageItem 
            key={msg.id} 
            msg={msg} 
            idx={idx} 
            onEdit={(i, content) => { setEditingIndex(i); setEditText(content); }}
            onDelete={(i) => { if(confirm("Hapus pesan ini?")) { const h = [...chatHistory]; h.splice(i, 1); setChatHistory(h); }}}
            isEditing={editingIndex === idx}
            editText={editText}
            setEditText={setEditText}
            onSaveEdit={(i) => {
               const nh = [...chatHistory];
               nh[i].content = editText;
               setChatHistory(nh);
               setEditingIndex(null);
            }}
            onCancelEdit={() => setEditingIndex(null)}
          />
        ))}
        {loading && (
          <div className="flex items-center gap-2 text-blue-500/50 italic text-[10px] font-bold tracking-widest animate-pulse pl-2">
            <div className="w-1.5 h-1.5 bg-blue-500 rounded-full"></div>
            SISTEM SEDANG MEMPROSES...
          </div>
        )}
      </main>

      {/* Modal 8 Slot Memori */}
      {showCharSlots && (
        <div className="fixed inset-0 bg-black/95 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-slate-900 w-full max-w-5xl max-h-[85vh] rounded-[2.5rem] border border-slate-800 flex flex-col overflow-hidden shadow-2xl">
            <div className="p-8 border-b border-slate-800 flex justify-between items-center bg-slate-900/50">
              <div className="flex flex-col">
                <h2 className="text-2xl font-black flex items-center gap-3"><Users className="text-indigo-400"/> DATABASE DUNIA</h2>
                <p className="text-xs text-slate-500 uppercase tracking-widest font-bold mt-1">Definisikan 8 NPC atau elemen penting dunia</p>
              </div>
              <button onClick={() => setShowCharSlots(false)} className="p-3 hover:bg-slate-800 rounded-full transition-colors"><X size={24}/></button>
            </div>
            <div className="overflow-y-auto p-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-6 bg-slate-950/20">
              {charSlots.map((char, i) => (
                <div key={i} className="bg-slate-900/50 p-5 rounded-3xl border border-slate-800 space-y-3 hover:border-indigo-500/30 transition-all group">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-indigo-600/10 flex items-center justify-center text-indigo-500 font-black group-hover:bg-indigo-600 group-hover:text-white transition-all">0{i+1}</div>
                    <input 
                      className="bg-transparent border-b border-slate-800 focus:border-indigo-500 outline-none flex-grow py-2 text-base font-black tracking-tight transition-all"
                      placeholder="NAMA NPC..."
                      value={char.name}
                      onChange={e => { const n = [...charSlots]; n[i].name = e.target.value; setCharSlots(n); }}
                    />
                  </div>
                  <textarea 
                    className="w-full bg-slate-950/50 p-4 rounded-2xl text-xs outline-none border border-slate-800 focus:border-indigo-500 h-28 resize-none leading-relaxed text-slate-300"
                    placeholder="Tulis kepribadian, rahasia, atau sejarah karakter ini agar AI selalu ingat..."
                    value={char.description}
                    onChange={e => { const n = [...charSlots]; n[i].description = e.target.value; setCharSlots(n); }}
                  />
                </div>
              ))}
            </div>
            <div className="p-6 border-t border-slate-800 flex justify-end bg-slate-900/50">
              <button onClick={() => setShowCharSlots(false)} className="bg-indigo-600 hover:bg-indigo-500 px-10 py-4 rounded-2xl font-black flex items-center gap-2 shadow-lg shadow-indigo-900/20 active:scale-95 transition-all"><Check size={20}/> TERAPKAN MEMORI</button>
            </div>
          </div>
        </div>
      )}

      {/* Input Navigasi & Textarea */}
      <footer className={`fixed bottom-0 left-0 w-full transition-all duration-500 ease-in-out z-50 ${isInputExpanded ? 'h-[55vh]' : 'h-auto'} bg-slate-950/80 backdrop-blur-2xl border-t border-slate-800 p-4`}>
        <div className="max-w-5xl mx-auto h-full flex flex-col">
          <div className="flex justify-between items-center mb-3 px-1">
            <button 
              onClick={() => setIsInputExpanded(!isInputExpanded)} 
              className="text-[9px] font-black text-slate-600 hover:text-slate-400 uppercase tracking-[0.3em] flex items-center gap-2 transition-colors"
            >
              {isInputExpanded ? <ChevronDown size={14}/> : <ChevronUp size={14}/>} 
              {isInputExpanded ? "Minimalkan Input" : "Perluas Area Ketik"}
            </button>
            <div className="flex gap-4">
               <button onClick={() => confirm("Hapus semua dialog saat ini? Slot save tidak akan terhapus.") && setChatHistory([])} className="text-[9px] font-black text-slate-600 hover:text-red-500 flex items-center gap-1 transition-colors uppercase tracking-widest">
                  <RefreshCcw size={12}/> Riset Layar
               </button>
            </div>
          </div>
          <div className={`flex gap-4 ${isInputExpanded ? 'flex-grow' : ''}`}>
            <div className="flex-grow bg-slate-900 border border-slate-800 rounded-[1.5rem] p-3 flex items-end overflow-hidden focus-within:border-blue-500 transition-all group">
              <textarea 
                className="w-full bg-transparent p-2 outline-none text-slate-200 h-full min-h-[45px] resize-none text-sm md:text-base leading-relaxed font-medium"
                placeholder="Ketik tindakan atau dialog di sini..."
                value={inputText}
                onChange={e => setInputText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey && !isInputExpanded) {
                    e.preventDefault();
                    handleSendMessage();
                  }
                }}
              />
            </div>
            <button 
              onClick={handleSendMessage}
              disabled={loading}
              className="w-14 h-14 bg-white text-black flex items-center justify-center rounded-[1.5rem] self-end hover:scale-105 active:scale-90 transition-all shadow-xl shadow-white/5 disabled:opacity-20 flex-shrink-0"
            >
              <Send size={24}/>
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default App;
