#!/bin/bash
# Bandeja Scoreboard — скрипт запуска
# Использование: ./start.sh

cd "$(dirname "$0")"

# Загружаем nvm если установлен
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

# Проверка node
if ! command -v node &> /dev/null; then
  echo "❌ Node.js не установлен. Установите его: https://nodejs.org"
  exit 1
fi

# Установка зависимостей если их нет
if [ ! -d "node_modules" ]; then
  echo "📦 Устанавливаю зависимости..."
  npm install
fi

# Запуск сервера
npm start
