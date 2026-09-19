#!/usr/bin/env bash
# ==============================================================================
# DEIZA CODE — Uso con endpoints de IA alternativos
# ==============================================================================
# Deiza Code arranca siempre con tu cuenta de Deiza (plan Friend o Signet).
# Una vez dentro puedes cambiar el motor que responde por cualquier servidor
# compatible con la API estándar de OpenAI (/v1/chat/completions).
# ==============================================================================

# 1. Ollama en local (Llama 3, DeepSeek Coder, Qwen, etc.)
# ------------------------------------------------------------------------------
# ollama run deepseek-coder-v2
deiza --endpoint http://localhost:11434 --model deepseek-coder-v2

# O mediante variables de entorno propias de Deiza Code:
export DEIZA_ENDPOINT="http://localhost:11434"
export DEIZA_MODEL="deepseek-coder-v2"
deiza

# 2. OpenAI o proxies compatibles (vLLM, LM Studio, Groq, OpenRouter)
# ------------------------------------------------------------------------------
deiza --endpoint https://api.openai.com/v1 --model gpt-4o --key sk-...
# o:
export DEIZA_ENDPOINT="https://api.openai.com/v1"
export DEIZA_ENDPOINT_KEY="sk-..."
export DEIZA_MODEL="gpt-4o"
deiza

# 3. vLLM o LM Studio local
# ------------------------------------------------------------------------------
deiza --endpoint http://localhost:8000/v1 --model mistral-7b-instruct

# 4. Volver al motor nativo de Deiza (deiza-omniscient)
# ------------------------------------------------------------------------------
deiza --endpoint deiza
