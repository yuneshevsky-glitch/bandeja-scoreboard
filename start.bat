@echo off
REM Bandeja Scoreboard - Windows launcher
REM Использование: двойной клик или start.bat из терминала

cd /d "%~dp0"

REM Проверка Node.js
where node >nul 2>nul
if errorlevel 1 (
  echo [X] Node.js не установлен.
  echo Скачайте и установите с https://nodejs.org
  pause
  exit /b 1
)

REM Установка зависимостей при первом запуске
if not exist "node_modules" (
  echo [*] Устанавливаю зависимости...
  call npm install
  if errorlevel 1 (
    echo [X] Ошибка установки зависимостей
    pause
    exit /b 1
  )
)

REM Запуск сервера
echo [*] Запускаю сервер...
call npm start
pause
