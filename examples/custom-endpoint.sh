#!/usr/bin/env bash
# ==============================================================================
# DEIZA CODE — Guía de Reciclaje y Uso con Endpoints Custom de IA
# ==============================================================================
# Deiza Code viene configurado de forma nativa para conectarse con la API de
# Deiza (https://deiza.org), pero está diseñado con una arquitectura universal
# compatible con cualquier proveedor que soporte la API estándar de OpenAI / v1.
# ==============================================================================

# 1. Usar con Ollama en local (Llama 3, DeepSeek Coder, Qwen, etc.)
# ------------------------------------------------------------------------------
# Inicia tu servidor de Ollama (por defecto en http://localhost:11434):
# ollama run deepseek-coder-v2

deiza --endpoint http://localhost:11434/v1 --model deepseek-coder-v2

# O mediante variables de entorno:
export OPENAI_BASE_URL="http://localhost:11434/v1"
export MODEL="deepseek-coder-v2"
deiza

# 2. Usar con OpenAI o proxies compatibles (vLLM, LM Studio, Groq, OpenRouter)
# ------------------------------------------------------------------------------
export OPENAI_BASE_URL="https://api.openai.com/v1"
export OPENAI_API_KEY="sk-..."
export MODEL="gpt-4o"
deiza

# 3. Usar con vLLM o LM Studio local
# ------------------------------------------------------------------------------
deiza --endpoint http://localhost:8000/v1 --model mistral-7b-instruct

# 4. Volver al endpoint nativo de Deiza en la nube
# ------------------------------------------------------------------------------
deiza --endpoint https://deiza.org
