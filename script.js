(async () => {
  if (!("Translator" in window)) {
    console.error("La API de Translator no está disponible en este navegador.");
    document.getElementById("output").innerHTML = 
      "<p style='color:red'>⚠️ Tu navegador no soporta la API de Translator (Chrome 138+ con IA activada).</p>";
    return;
  }

  // Crear traductor
  const translator = await Translator.create({
    sourceLanguage: "es",
    targetLanguage: "en"
  });

  // Configurar SpeechRecognition
  const recognition = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
  recognition.lang = "es-ES";
  recognition.continuous = true;
  recognition.interimResults = true;

  let finalText = "";
  let isListening = false;
  const maxWords = 50; // Limite de palabras antes de limpiar automáticamente

  const output = document.getElementById("output");
  const toggleMicBtn = document.getElementById("toggleMic");
  const clearBtn = document.getElementById("clearText");

  // Función para limpiar texto
  const clearText = () => {
    finalText = "";
    output.innerHTML = `
      <p><b>Texto original (ES):</b><br></p>
      <p><b>Traducción (EN):</b><br></p>
    `;
  };

  // Alternar micrófono
  toggleMicBtn.addEventListener("click", () => {
    if (isListening) {
      recognition.stop();
      isListening = false;
      toggleMicBtn.textContent = "🎙️ Iniciar Micrófono";
    } else {
      recognition.start();
      isListening = true;
      toggleMicBtn.textContent = "⏹️ Detener Micrófono";
    }
  });

  // Botón limpiar
  clearBtn.addEventListener("click", clearText);

  // Evento de resultado
  recognition.onresult = async (event) => {
    let interimText = "";
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const transcript = event.results[i][0].transcript;
      if (event.results[i].isFinal) {
        finalText += transcript + " ";
      } else {
        interimText += transcript;
      }
    }

    const fullText = finalText + interimText;

    // Limpiar automáticamente si se excede el límite de palabras
    if (fullText.trim().split(/\s+/).length > maxWords) {
      clearText();
      return;
    }

    output.innerHTML = `
      <p><b>Texto original (ES):</b><br>${fullText}</p>
      <p><b>Traduciendo...</b></p>
    `;

    if (fullText.trim()) {
      const translation = await translator.translate(fullText);
      output.innerHTML = `
        <p><b>Texto original (ES):</b><br>${fullText}</p>
        <p><b>Traducción (EN):</b><br>${translation}</p>
      `;
    }
  };

  recognition.onerror = (event) => {
    console.error("Error en reconocimiento de voz:", event.error);
  };
})();
