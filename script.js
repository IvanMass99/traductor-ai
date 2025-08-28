(() => {
    // -------------------- DOM --------------------
    const toggleMicBtn  = document.getElementById("toggleMic");
    const clearBtn      = document.getElementById("clearText");
    const sourceSel     = document.getElementById("sourceLang");
    const targetSel     = document.getElementById("targetLang");
    const statusBadge   = document.getElementById("statusBadge");
    const lyricsEl      = document.getElementById("lyrics");
  
    // Fondo (dos capas para crossfade)
    const bgA = document.getElementById("bgA");
    const bgB = document.getElementById("bgB");
    let activeLayer = bgA;         // la capa actualmente visible
    let hiddenLayer = bgB;         // la que vamos a preparar y mostrar
    // estado inicial: negro
    activeLayer.style.setProperty("--bg1", "#000000");
    activeLayer.style.setProperty("--bg2", "#000000");
    activeLayer.style.opacity = "1";
    hiddenLayer.style.opacity = "0";
  
    // -------------------- Speech --------------------
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { setBadge("⚠️ Reconocimiento no soportado","err"); return; }
    const recognition = new SR();
    recognition.continuous = true;
    recognition.interimResults = true;
  
    // Códigos de voz por idioma origen
    const speechLocales = { es:"es-ES", en:"en-US", de:"de-DE", pt:"pt-BR" };
  
    // -------------------- Traducción on-device --------------------
    let translator = null;
    let gettingTranslator = null;
    let hasTranslatorAPI = "Translator" in window;
  
    async function ensureTranslator(src, dst) {
      if (translator && translator.__src === src && translator.__dst === dst) return translator;
      if (!hasTranslatorAPI) {
        translator = { translate: async (t)=>t, __fallback:true, __src:src, __dst:dst };
        return translator;
      }
      if (gettingTranslator) return gettingTranslator;
  
      gettingTranslator = (async () => {
        setBadge("⏬ Preparando traductor…","warn");
        try{
          const t = await Translator.create({
            sourceLanguage: src, targetLanguage: dst,
            monitor(m){ m.addEventListener("downloadprogress", e => {
              setBadge(`⏬ Descargando modelo… ${Math.round(e.loaded*100)}%`,"warn");
            });}
          });
          t.__src = src; t.__dst = dst; translator = t;
          setBadge("✅ Traductor listo","ok");
          return t;
        }catch(err){
          console.warn("Translator no disponible:", err);
          hasTranslatorAPI = false;
          translator = { translate: async (t)=>t, __fallback:true, __src:src, __dst:dst };
          setBadge("ℹ️ Sin traducción (API no disponible)","warn");
          return translator;
        }finally{ gettingTranslator = null; }
      })();
  
      return gettingTranslator;
    }
  
    // -------------------- Tema por idioma de DESTINO + crossfade --------------------
    // Paletas 2-tonos inspiradas en banderas (EN/ES/DE/PT)
    const LANG_THEMES = {
      es: ["#AA151B", "#F1BF00"], // rojo / amarillo (España)
      en: ["#012169", "#C8102E"], // azul / rojo (UK/US)
      de: ["#DD0000", "#FFCE00"], // rojo / dorado (Alemania)
      pt: ["#046A38", "#C8102E"], // verde / rojo (Portugal)
    };
  
    function gradientFor(c1, c2){
      // mismo patrón de radiales + gradiente base
      return `
        radial-gradient(1200px 600px at 10% -10%, rgba(255,255,255,0.06), transparent 60%),
        radial-gradient(900px 700px at 90% 110%, rgba(255,255,255,0.08), transparent 60%),
        linear-gradient(180deg, ${c1}, ${c2})
      `;
    }
  
    // Crossfade de una capa a otra (cambio gradual)
    function crossfadeTo(c1, c2, immediate=false){
      // preparar la capa oculta con los nuevos colores
      hiddenLayer.style.background = gradientFor(c1, c2);
      hiddenLayer.style.setProperty("--bg1", c1);
      hiddenLayer.style.setProperty("--bg2", c2);
  
      if (immediate){
        // intercambio sin animación
        activeLayer.style.opacity = "0";
        hiddenLayer.style.opacity = "1";
      } else {
        // animación suave (definida en CSS)
        hiddenLayer.style.opacity = "1";
        activeLayer.style.opacity = "0";
      }
  
      // swap referencias cuando termina la transición (~900ms)
      setTimeout(() => {
        const tmp = activeLayer;
        activeLayer = hiddenLayer;
        hiddenLayer = tmp;
      }, immediate ? 0 : 950);
    }
  
    function applyThemeByTargetLang(lang, immediate=false){
      const [bg1,bg2] = LANG_THEMES[lang] || ["#000000","#000000"];
      crossfadeTo(bg1, bg2, immediate);
    }
  
    // -------------------- Estado / helpers --------------------
    let isListening = false;
    let finalText = "";
    const maxWords = 120;
  
    // Borrado al retomar después de silencio
    let resetOnNextSpeech = false;
    let silenceTimer = null;
  
    function setBadge(text, kind="ok"){
      statusBadge.textContent = text;
      statusBadge.className = `badge ${kind}`;
    }
    function resetLyrics(){ finalText=""; lyricsEl.innerHTML=""; }
  
    function appendLine(orig, tran, isInterim=false){
      const line = document.createElement("div");
      line.className = "line fade-in";
      const o = document.createElement("div");
      o.className = "orig"; o.textContent = orig;
      const t = document.createElement("div");
      t.className = "tran"; t.textContent = tran || (isInterim ? "Traduciendo…" : "");
      line.appendChild(o);
      if (t.textContent) line.appendChild(t);
      lyricsEl.appendChild(line);
      lyricsEl.scrollTo({ top: lyricsEl.scrollHeight, behavior: "smooth" });
    }
    function splitChunks(text){
      const parts = text.split(/(?<=[\.\!\?\…\,\;\:])\s+/).map(s=>s.trim()).filter(Boolean);
      return parts.length ? parts : [text];
    }
    function renderAll(fullText, translated, interim=false){
      lyricsEl.innerHTML = "";
      const oParts = splitChunks(fullText);
      const tParts = splitChunks(translated || "");
      for (let i=0;i<oParts.length;i++){
        appendLine(oParts[i], tParts[i] || "", interim && i===oParts.length-1);
      }
    }
  
    // -------------------- Idiomas --------------------
    function applyLanguages(){
      const src = sourceSel.value;
      const dst = targetSel.value;
      if (src === dst) targetSel.value = (dst === "en") ? "es" : "en";
      recognition.lang = speechLocales[sourceSel.value] || "es-ES";
      translator = null;
      hasTranslatorAPI = "Translator" in window;
      setBadge(`Origen: ${sourceSel.value.toUpperCase()} · Destino: ${targetSel.value.toUpperCase()}`);
      // si estoy escuchando y cambian el destino, cambiar tema gradualmente
      if (isListening) applyThemeByTargetLang(targetSel.value);
    }
    applyLanguages();
  
    sourceSel.addEventListener("change", () => {
      applyLanguages();
      if (isListening) { recognition.stop(); recognition.start(); }
    });
    targetSel.addEventListener("change", () => { applyLanguages(); });
  
    // -------------------- Botones --------------------
    clearBtn.addEventListener("click", resetLyrics);
  
    toggleMicBtn.addEventListener("click", async () => {
      if (isListening) {
        recognition.stop();
        isListening = false;
        toggleMicBtn.textContent = "▶️ Iniciar";
        toggleMicBtn.classList.remove("is-on");
        setBadge("Pausado");
        return;
      }
  
      // Al iniciar: aplicar colores según idioma de DESTINO (con crossfade)
      applyThemeByTargetLang(targetSel.value);
      resetLyrics();
  
      await ensureTranslator(sourceSel.value, targetSel.value);
  
      recognition.start();
      isListening = true;
      toggleMicBtn.textContent = "⏹️ Detener";
      toggleMicBtn.classList.add("is-on");
      setBadge("Escuchando…");
    });
  
    // -------------------- Eventos de voz --------------------
    recognition.onresult = async (event) => {
      if (resetOnNextSpeech){ resetOnNextSpeech=false; finalText=""; resetLyrics(); }
  
      let interim = "";
      for (let i=event.resultIndex; i<event.results.length; i++){
        const { transcript } = event.results[i][0];
        if (event.results[i].isFinal) finalText += transcript + " ";
        else interim += transcript;
      }
  
      const fullText = (finalText + interim).trim();
      if (!fullText) return;
  
      if (fullText.split(/\s+/).length > maxWords) { resetLyrics(); finalText=""; }
  
      renderAll(fullText, "", true);
  
      const t = await ensureTranslator(sourceSel.value, targetSel.value);
      const translated = await t.translate(fullText);
      renderAll(fullText, translated, false);
      if (t.__fallback) setBadge("ℹ️ Sin traducción (API no disponible)","warn");
  
      if (silenceTimer) clearTimeout(silenceTimer);
      silenceTimer = setTimeout(() => { resetOnNextSpeech = true; }, 3000);
    };
  
    recognition.onspeechend = () => { resetOnNextSpeech = true; };
    recognition.onsoundend  = () => { resetOnNextSpeech = true; };
    recognition.onspeechstart = () => {
      if (resetOnNextSpeech){ resetOnNextSpeech=false; finalText=""; resetLyrics(); }
    };
    recognition.onerror = e => { console.error(e); setBadge(`⚠️ Voz: ${e.error}`,"err"); };
  })();
  