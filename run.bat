@echo off
cd /d "%~dp0"
start "" cmd /c "timeout /t 8 >nul & start http://localhost:8501"
"venv\Scripts\python.exe" -m streamlit run app.py --server.headless true --browser.gatherUsageStats false
pause
