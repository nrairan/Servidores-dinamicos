from fastapi import FastAPI
import uvicorn
import sys

app = FastAPI(
    title="Servidor de la red dinamica",
)

puerto = int (sys.argv[1]) 
nombre=sys.argv[2]

contador=0

@app.get("/")
def inicio():
    return {
        "servidor": nombre,
        "mensaje": "Servidor disponible",
        "puerto": puerto
    }

@app.get("/procesar")
def procesar():
    global contador
    contador += 1
    return {
        "servidor": nombre,
        "puerto": puerto,
        "solicitudes_atendidas": contador,
        "resultado": "Solicitud procesada correctamente"
    }

@app.get("/health")
def health():
    return {
        "servidor": nombre,
        "puerto": puerto,
        "estado": "Operativo"
    }

if __name__ == "__main__":
    uvicorn.run(
        app, 
        host="0.0.0.0", 
        port=puerto
    )

