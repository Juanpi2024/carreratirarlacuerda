// gas_connector.js

// Reemplaza esta URL con la que te da Google al publicar el Apps Script
const GAS_WEB_APP_URL = "https://script.google.com/macros/s/AKfycbycwe1q2wzX-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx/exec";

/**
 * Función para descargar todas las preguntas desde Google Sheets al iniciar la sala Host.
 * Retorna una promesa con el arreglo de preguntas.
 */
async function fetchQuestionsFromGAS() {
    try {
        console.log("Fetching questions from Google Sheets...");
        // Debido a CORS, GAS responde con redirecciones, usaremos un GET simple.
        const response = await fetch(GAS_WEB_APP_URL);

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const questions = await response.json();
        console.log(`Loaded ${questions.length} questions from GAS.`);
        return questions;

    } catch (error) {
        console.error("Error fetching from GAS:", error);
        return null;
    }
}

/**
 * Función para enviar las estadísticas al finalizar la carrera
 */
async function sendMetricsToGAS(winnerTeam, totalTimeStr) {
    try {
        console.log("Sending match results to GAS...");
        const response = await fetch(GAS_WEB_APP_URL, {
            method: "POST",
            mode: "no-cors", // Requerido para evitar problemas de CORS de Chrome al hacer POST a google scripts
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                winner: winnerTeam,
                time: totalTimeStr
            })
        });

        console.log("Metrics sent successfully.");
    } catch (error) {
        console.error("Error sending metrics to GAS:", error);
    }
}
