@echo off
cd /d "%~dp0"
echo Installing Intel OpenVINO backend for the embeddings...
"venv\Scripts\python.exe" -m pip install "sentence-transformers[openvino]" > openvino_install.log 2>&1
"venv\Scripts\python.exe" -c "from sentence_transformers import SentenceTransformer as S; m=S('all-MiniLM-L6-v2', backend='openvino'); print('OPENVINO OK', m.encode(['test']).shape)" >> openvino_install.log 2>&1
echo Done - see openvino_install.log
pause
