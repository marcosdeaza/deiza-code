<p align="center">
  <img src="assets/banner.png" alt="Deiza Code Banner" width="100%" />
</p>

<p align="center">
  <strong>Agente de codificación autónomo en tu terminal.</strong><br/>
  Nativo para la API de <a href="https://deiza.org">deiza.org</a> y 100% reciclable para cualquier endpoint de IA.
</p>

<p align="center">
  <a href="https://github.com/marcosdeaza/deiza-code/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-MIT-8C2F39.svg" alt="License MIT"></a>
  <a href="https://nodejs.org"><img src="https://img.shields.io/badge/Node-%3E%3D18.0.0-8C2F39.svg" alt="Node >=18"></a>
  <a href="https://deiza.org"><img src="https://img.shields.io/badge/Endpoint-deiza.org-8C2F39.svg" alt="Deiza Endpoint"></a>
  <a href="#-reciclaje-universal-usa-cualquier-ia"><img src="https://img.shields.io/badge/AI-Universal_Recyclable-success.svg" alt="Universal AI"></a>
  <a href="https://deiza.org/download"><img src="https://img.shields.io/badge/Download-macOS_|_Linux_|_Windows-8C2F39.svg" alt="Platforms"></a>
</p>

---

## 🎬 Demostración en Vivo

Mira a **Deiza Code** analizando el repositorio, realizando preguntas interactivas, aplicando diffs quirúrgicos de código y validando los tests automáticamente:

<p align="center">
  <img src="assets/demo.gif" alt="Deiza Code Live Demo Walkthrough" width="100%" style="border-radius: 12px; box-shadow: 0 10px 30px rgba(0,0,0,0.5);" />
</p>

---

## ✨ ¿Qué es Deiza Code?

**Deiza Code** es un agente agéntico de desarrollo para terminal inspirado en la velocidad, ergonomía y precisión de *Claude Code*. 

Impulsado en exclusiva por el modelo **Deiza Omniscient (Liquid 5.1)**, conectado a clusters de alta capacidad en Amazon AWS para garantizar velocidad extrema y diffs quirúrgicos sin colas de espera. Disponible exclusivamente para cuentas con **planes de pago (Friend o Signet)** con sincronización de créditos y ventana de 5 horas mediante inicio de sesión en un solo clic desde tu navegador.

> 🚀 **Cero Lock-in:** Aunque tira de forma nativa de la infraestructura de **deiza.org**, el motor está desacoplado para que puedas **reciclarlo y reutilizarlo como CLI agéntica con cualquier otro proyecto o endpoint de IA** (Ollama, OpenAI, DeepSeek, vLLM, LM Studio, etc.).

---

## 🔄 Reciclaje Universal: Usa Cualquier IA

Puedes reutilizar Deiza Code para **cualquier modelo o proveedor LLM** que soporte la especificación estándar OpenAI `/chat/completions`:

### 1. Con Ollama en local (DeepSeek-Coder, Llama 3, Qwen)
```bash
# Inicia tu modelo en Ollama:
ollama run deepseek-coder-v2

# Lanza Deiza Code apuntando a tu instancia local:
deiza --endpoint http://localhost:11434/v1 --model deepseek-coder-v2
```

### 2. Con OpenAI o Proxies Compatibles
```bash
export OPENAI_BASE_URL="https://api.openai.com/v1"
export OPENAI_API_KEY="sk-..."
export MODEL="gpt-4o"

deiza
```

### 3. Con vLLM, LM Studio o LocalAI
```bash
deiza --endpoint http://localhost:8000/v1 --model mistral-7b-instruct
```

### 4. Volver al Endpoint Oficial de Deiza
```bash
deiza --endpoint https://deiza.org
```

---

## ⚡ Características Principales

- **Modos Duales: BUILD y PLAN:**
  - **Modo BUILD:** Edición quirúrgica activa de código, diffs visuales y ejecución de comandos.
  - **Modo PLAN:** Exploración arquitectónica segura sin mutar el sistema de archivos, formulando blueprints paso a paso antes de aplicar cambios.
- **Motor Multi-Agente:** Permite a Deiza Code delegar subtareas (investigación de contexto, auditorías de seguridad, ejecución de suites de test) a subagentes autónomos aislados (`invoke_subagent`).
- **Visión Multimodal:** Soporte nativo para inspeccionar capturas de pantalla, maquetas y assets de diseño mediante comandos `/image` y la herramienta `view_image`.
- **Edición Quirúrgica de Código:** Aplica reemplazos exactos mostrando **diffs visuales** en color verde y rojo directamente en la terminal antes y después de modificar archivos.
- **Herramientas Agénticas Integradas:**
  - `read_file`: Lectura con rangos exactos de líneas.
  - `edit_file`: Modificación precisa mediante reemplazo contextual único.
  - `write_file`: Creación y sobreescritura de archivos con renderizado de diferencias.
  - `list_dir`: Exploración jerárquica de carpetas y tamaños.
  - `search_files`: Búsqueda rápida por texto o regex ignorando carpetas pesadas (`node_modules`, `.git`, etc.).
  - `run_command`: Ejecución de comandos en bash con captura de salida y errores.
  - `invoke_subagent`: Delegación concurrente de subtareas a subagentes de soporte.
  - `view_image`: Análisis visual multimodal de maquetas e interfaces.
- **Guardas de Seguridad:** Pide confirmación interactiva `[s/N]` antes de ejecutar comandos potencialmente destructivos (`rm -rf`, `git reset --hard`, etc.). Puedes usar `--yes` para automatizar pipelines CI/CD.
- **Detección Automática de Contexto:** Al arrancar en cualquier proyecto, detecta el branch de Git, archivos modificados, estructura de directorios y directivas (`.deizarules` o `CLAUDE.md`).
- **Autenticación en 1 Clic:** Levanta un callback loopback local en `127.0.0.1:54321` y abre el navegador para vincular tu cuenta al instante.
- **Estética Granate Profesional (`#8C2F39`):** Interfaz sobria, minimalista, con tipografía limpia y sin elementos innecesarios.

---

## 📦 Instalación Rápida

### En macOS y Linux (Bash)
```bash
curl -fsSL https://deiza.org/install.sh | bash
```

### En Windows (PowerShell / CMD)
```powershell
irm https://deiza.org/install.ps1 | iex
```

### 🧠 Neural / AI Agent (Instalación Desatendida)
Pega este prompt directamente en tu agente de IA (Claude Code, Antigravity, Cursor, etc.):
```text
Instala Deiza Code en mi sistema de forma automática ejecutando el script oficial según mi sistema operativo: si es macOS o Linux ejecuta en bash 'curl -fsSL https://deiza.org/install.sh | bash', o si es Windows ejecuta en PowerShell 'irm https://deiza.org/install.ps1 | iex'. Una vez instalado, ejecuta 'deiza --version' para verificar y abre la autenticación con 'deiza --login'.
```

### Mediante npm / npx
```bash
# Ejecutar directamente sin instalar
npx deiza-code

# O instalar globalmente en tu sistema
npm install -g deiza-code
```

---

## 🕹️ Comandos en la Terminal (REPL)

> 💡 **Paleta Interactiva en Tiempo Real:** Al teclear `/` en la terminal, se despliega instantáneamente la lista de comandos disponibles con búsqueda en vivo. Presiona `Tab` para autocompletar cualquier comando.

| Comando | Descripción |
| :--- | :--- |
| `/` | Despliega la paleta interactiva de comandos en vivo |
| `/plan [query]` | Activa el modo PLAN (inspección arquitectónica y blueprint sin modificar archivos) |
| `/build [query]` | Activa el modo BUILD (edición quirúrgica, diffs visuales y tests activos) |
| `/mode [plan\|build]` | Alterna rápidamente entre modo BUILD y PLAN |
| `/agent <rol> <tarea>` | Lanza un subagente worker aislado para auditar o investigar código |
| `/image <ruta> [inst]` | Inspecciona una imagen, captura o mockup con visión multimodal |
| `/whoami` | Muestra el perfil de usuario, plan (`Friend` / `Signet`), cuota y estado de la ventana |
| `/update` | Comprueba y actualiza automáticamente Deiza Code a la última versión disponible |
| `/model [id]` | Consulta o cambia el modelo en caliente |
| `/usage` | Consulta el consumo de tokens y la cuenta atrás de la ventana de 5 horas |
| `/config` | Consulta o ajusta opciones locales (`~/.deiza/config.json`) |
| `/endpoint [url]` | Conecta a otro endpoint de IA (Ollama, OpenAI, vLLM) |
| `/init` | Crea un archivo de directivas `.deizarules` en la raíz de tu proyecto |
| `/clear` | Limpia el historial de la conversación actual |
| `/login` | Inicia sesión con selector interactivo (Navegador Web 1-Clic o API Key directa) |
| `/logout` | Cierra la sesión en el equipo actual y elimina credenciales locales |
| `/help` | Muestra la ayuda detallada con ejemplos de uso |
| `/exit` | Salir de Deiza Code |

---

## 🔐 Autenticación Flexible (Navegador o API Key)

Deiza Code ofrece dos métodos de conexión integrados para adaptarse a cualquier flujo:
1. **Navegador Web (Recomendado · 1 Clic):** Abre automáticamente tu navegador para autorizar la terminal de forma instantánea mediante loopback local en `127.0.0.1:54321`.
2. **API Key Directa (`dz_...`):** Ideal para entornos remotos por SSH, contenedores Docker o servidores headless donde no hay navegador disponible. La clave se valida contra la API de Deiza verificando el plan activo (`Friend` o `Signet`).

---

## 🛠️ Opciones de CLI

```text
Uso:
  deiza [opciones] [instrucción]
  deiza-code [opciones] [instrucción]

Opciones:
  -v, --version         Muestra la versión instalada
  -h, --help            Muestra este mensaje de ayuda
  -p, --prompt <texto>  Ejecuta una instrucción directa en modo headless
  -y, --yes             Aprueba automáticamente comandos bash sin preguntar
  --login               Fuerza autenticación por navegador en deiza.org
  --model <id>          Modelo a utilizar (ej. deiza-liquid-5, llama3, gpt-4o)
  --endpoint <url>      URL base del servidor de IA
  --key <apiKey>        Clave API para la sesión
```

---

## 📂 Estructura del Proyecto

```text
deiza-code/
├── bin/
│   └── deiza.js          # Punto de entrada ejecutable CLI
├── src/
│   ├── index.js          # REPL interactivo y comandos slash
│   ├── agent.js          # Motor agéntico multi-turno y cliente SSE
│   ├── tools.js          # Implementación de herramientas y diffs
│   ├── context.js        # Detector de Git y contexto de proyecto
│   ├── auth.js           # Servidor loopback OAuth y gestión de API key
│   ├── ui.js             # Estética granate ANSI, banners y formateadores
│   ├── config.js         # Persistencia en ~/.deiza/config.json
│   └── prompt.js         # System prompt de grado Claude Code
├── assets/
│   ├── banner.png        # Banner oficial de Deiza Code
│   └── demo.gif          # Grabación animada de la terminal en acción
├── examples/
│   ├── custom-endpoint.sh # Ejemplos de integración con Ollama y OpenAI
│   └── deizarules.example # Plantilla de directivas de desarrollo
├── package.json
└── README.md
```

---

## 📄 Licencia

Distribuido bajo la Licencia MIT. Consulta [LICENSE](LICENSE) para más detalles.
Desarrollado con ❤️ para la comunidad de desarrolladores de [Deiza](https://deiza.org).
