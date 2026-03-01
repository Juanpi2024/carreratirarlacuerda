// ==========================================
// AI Question Bank Generator
// Uses OpenAI GPT-4o-mini to generate question banks
// for Carrera del Conocimiento
// ==========================================
// Usage: node generate/ai_generator.js [subject]
// Example: node generate/ai_generator.js lenguaje

const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
if (!OPENAI_API_KEY) {
    console.error('❌ OPENAI_API_KEY not found in .env');
    process.exit(1);
}

// ==========================================
// SUBJECT DEFINITIONS
// ==========================================
const SUBJECTS = {
    lenguaje: {
        id: 'lenguaje',
        name: 'Lenguaje y Comunicación',
        icon: '📖',
        color: '#ffd700',
        levels: {
            '1-2': {
                description: '1° a 2° Básico',
                prompt: `Genera 60 preguntas de Lenguaje y Comunicación para 1° y 2° básico (Chile, currículo MINEDUC).
Tipos: contar sílabas, completar palabras, identificar vocales/consonantes, rimas, sinónimos simples.
Cada pregunta tiene 4 opciones y una respuesta correcta (índice 1-4).
Las preguntas deben ser simples, con palabras que un niño de 6-7 años conozca.`
            },
            '3-4': {
                description: '3° a 4° Básico',
                prompt: `Genera 60 preguntas de Lenguaje y Comunicación para 3° y 4° básico (Chile, currículo MINEDUC).
Tipos: sinónimos, antónimos, género y número, artículos, sustantivos vs adjetivos, verbos simples, comprensión de oraciones cortas.
Cada pregunta tiene 4 opciones y una respuesta correcta (índice 1-4).`
            },
            '5-6': {
                description: '5° a 6° Básico',
                prompt: `Genera 60 preguntas de Lenguaje y Comunicación para 5° y 6° básico (Chile, currículo MINEDUC).
Tipos: conjugación verbal, acentuación (agudas/graves/esdrújulas), prefijos/sufijos, tipos de textos, figuras literarias básicas, sujeto y predicado, comprensión lectora corta.
Cada pregunta tiene 4 opciones y una respuesta correcta (índice 1-4).`
            },
            '7-8': {
                description: '7° a 8° Básico',
                prompt: `Genera 60 preguntas de Lenguaje y Comunicación para 7° y 8° básico (Chile, currículo MINEDUC).
Tipos: figuras literarias (metáfora, personificación, hipérbole), análisis sintáctico, tipos de narrador, géneros literarios, ortografía avanzada, vocabulario contextual, comprensión lectora.
Cada pregunta tiene 4 opciones y una respuesta correcta (índice 1-4).`
            }
        }
    },
    ciencias: {
        id: 'ciencias',
        name: 'Ciencias Naturales',
        icon: '🔬',
        color: '#39ff14',
        levels: {
            '1-2': {
                description: '1° a 2° Básico',
                prompt: `Genera 60 preguntas de Ciencias Naturales para 1° y 2° básico (Chile, currículo MINEDUC).
Tipos: partes del cuerpo, sentidos, animales (hábitat, alimentación, patas), plantas (partes), día y noche, estaciones del año, materiales.
Cada pregunta tiene 4 opciones y una respuesta correcta (índice 1-4).
Las preguntas deben ser simples y concretas.`
            },
            '3-4': {
                description: '3° a 4° Básico',
                prompt: `Genera 60 preguntas de Ciencias Naturales para 3° y 4° básico (Chile, currículo MINEDUC).
Tipos: sistema solar, estados de la materia, ciclo del agua, alimentación y nutrientes, vertebrados vs invertebrados, ecosistemas simples, fuerza y movimiento básico.
Cada pregunta tiene 4 opciones y una respuesta correcta (índice 1-4).`
            },
            '5-6': {
                description: '5° a 6° Básico',
                prompt: `Genera 60 preguntas de Ciencias Naturales para 5° y 6° básico (Chile, currículo MINEDUC).
Tipos: célula (partes y funciones), sistemas del cuerpo humano, fotosíntesis, cadenas alimentarias, capas de la Tierra, energía (tipos), electricidad básica.
Cada pregunta tiene 4 opciones y una respuesta correcta (índice 1-4).`
            },
            '7-8': {
                description: '7° a 8° Básico',
                prompt: `Genera 60 preguntas de Ciencias Naturales para 7° y 8° básico (Chile, currículo MINEDUC).
Tipos: tabla periódica (símbolos, grupos), reacciones químicas simples, fuerza y leyes de Newton, ondas y sonido, reproducción celular (mitosis), microorganismos, genética básica.
Cada pregunta tiene 4 opciones y una respuesta correcta (índice 1-4).`
            }
        }
    },
    historia: {
        id: 'historia',
        name: 'Historia y Geografía',
        icon: '🌍',
        color: '#ff6b35',
        levels: {
            '1-2': {
                description: '1° a 2° Básico',
                prompt: `Genera 60 preguntas de Historia y Geografía para 1° y 2° básico (Chile, currículo MINEDUC).
Tipos: símbolos patrios de Chile, meses del año, días de la semana, familia y comunidad, normas de convivencia, Chile en el mapa, paisajes naturales.
Cada pregunta tiene 4 opciones y una respuesta correcta (índice 1-4).
Las preguntas deben ser simples y concretas para niños de 6-7 años.`
            },
            '3-4': {
                description: '3° a 4° Básico',
                prompt: `Genera 60 preguntas de Historia y Geografía para 3° y 4° básico (Chile, currículo MINEDUC).
Tipos: zonas naturales de Chile (norte, centro, sur), pueblos originarios, patrimonio cultural, coordenadas básicas, continentes y océanos, recursos naturales.
Cada pregunta tiene 4 opciones y una respuesta correcta (índice 1-4).`
            },
            '5-6': {
                description: '5° a 6° Básico',
                prompt: `Genera 60 preguntas de Historia y Geografía para 5° y 6° básico (Chile, currículo MINEDUC).
Tipos: descubrimiento y conquista de América, colonia en Chile, independencia de Chile, civilizaciones precolombinas (inca, maya, azteca), derechos y deberes, organización política de Chile.
Cada pregunta tiene 4 opciones y una respuesta correcta (índice 1-4).`
            },
            '7-8': {
                description: '7° a 8° Básico',
                prompt: `Genera 60 preguntas de Historia y Geografía para 7° y 8° básico (Chile, currículo MINEDUC).
Tipos: Revolución Francesa, Revolución Industrial, guerras mundiales, Guerra Fría, democracia y derechos humanos, globalización, geografía de América y el mundo.
Cada pregunta tiene 4 opciones y una respuesta correcta (índice 1-4).`
            }
        }
    },
    ingles: {
        id: 'ingles',
        name: 'Inglés',
        icon: '🇬🇧',
        color: '#e040fb',
        levels: {
            '1-2': {
                description: '1° a 2° Básico',
                prompt: `Genera 60 preguntas de Inglés para 1° y 2° básico (Chile, currículo MINEDUC).
Tipos: colores en inglés, números 1-20, animales, partes del cuerpo, saludos (hello, goodbye), objetos del aula, familia (mother, father).
La pregunta puede estar en español o inglés, las opciones deben ser claras.
Cada pregunta tiene 4 opciones y una respuesta correcta (índice 1-4).`
            },
            '3-4': {
                description: '3° a 4° Básico',
                prompt: `Genera 60 preguntas de Inglés para 3° y 4° básico (Chile, currículo MINEDUC).
Tipos: vocabulario (food, clothes, weather), preposiciones (in, on, under), pronombres personales, verbo to be, adjetivos básicos, días y meses en inglés.
Cada pregunta tiene 4 opciones y una respuesta correcta (índice 1-4).`
            },
            '5-6': {
                description: '5° a 6° Básico',
                prompt: `Genera 60 preguntas de Inglés para 5° y 6° básico (Chile, currículo MINEDUC).
Tipos: presente simple vs presente continuo, pasado simple (verbos regulares e irregulares), vocabulario intermedio, comparativos y superlativos, there is/there are, can/can't.
Cada pregunta tiene 4 opciones y una respuesta correcta (índice 1-4).`
            },
            '7-8': {
                description: '7° a 8° Básico',
                prompt: `Genera 60 preguntas de Inglés para 7° y 8° básico (Chile, currículo MINEDUC).
Tipos: will/going to, present perfect, modals (should, must, might), phrasal verbs comunes, reading comprehension, vocabulario avanzado, conectores.
Cada pregunta tiene 4 opciones y una respuesta correcta (índice 1-4).`
            }
        }
    }
};

// ==========================================
// OPENAI API CALL
// ==========================================
async function callOpenAI(prompt) {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${OPENAI_API_KEY}`
        },
        body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [
                {
                    role: 'system',
                    content: `Eres un experto en educación chilena (MINEDUC). Generas bancos de preguntas de opción múltiple para un juego educativo competitivo tipo "carrera del conocimiento". 
REGLAS ESTRICTAS:
- Responde SOLO con un array JSON válido, sin markdown, sin explicaciones.
- Cada pregunta tiene: {"text": "pregunta", "options": ["op1","op2","op3","op4"], "answer": N}
- "answer" es el ÍNDICE de la opción correcta (1, 2, 3 o 4).
- Las opciones incorrectas deben ser plausibles pero claramente distintas a la correcta.
- Varía la posición de la respuesta correcta (no siempre en la misma posición).
- Las preguntas deben ser concisas (máximo 80 caracteres) para caber en una pantalla móvil.
- Mezcla dificultad: 30% fáciles, 40% normales, 30% difíciles.`
                },
                { role: 'user', content: prompt }
            ],
            temperature: 0.8,
            max_tokens: 16000
        })
    });

    if (!response.ok) {
        const err = await response.text();
        throw new Error(`OpenAI API error ${response.status}: ${err}`);
    }

    const data = await response.json();
    const content = data.choices[0].message.content.trim();

    // Clean potential markdown wrapping
    let jsonStr = content;
    if (jsonStr.startsWith('```')) {
        jsonStr = jsonStr.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    }

    return JSON.parse(jsonStr);
}

// ==========================================
// GENERATE MODULE FILE
// ==========================================
function generateModuleFile(subject, questionsByLevel) {
    const subj = SUBJECTS[subject];

    let code = `// ==========================================\n`;
    code += `// MÓDULO: ${subj.name.toUpperCase()} ${subj.icon}\n`;
    code += `// Generado automáticamente con OpenAI GPT-4o-mini\n`;
    code += `// Fecha: ${new Date().toISOString().split('T')[0]}\n`;
    code += `// ==========================================\n\n`;
    code += `window.QuestionModules = window.QuestionModules || {};\n\n`;
    code += `window.QuestionModules.${subject} = {\n`;
    code += `    id: '${subject}',\n`;
    code += `    name: '${subj.name}',\n`;
    code += `    icon: '${subj.icon}',\n`;
    code += `    color: '${subj.color}',\n`;
    code += `    answerType: 'multiple-choice',\n\n`;
    code += `    // Pre-generated question banks per level\n`;
    code += `    _banks: ${JSON.stringify(questionsByLevel, null, 2)},\n\n`;
    code += `    generateQuestion: function (level, difficulty) {\n`;
    code += `        const bank = this._banks[level];\n`;
    code += `        if (!bank || bank.length === 0) {\n`;
    code += `            return { text: 'Sin preguntas para este nivel', answer: 1, options: ['—','—','—','—'] };\n`;
    code += `        }\n`;
    code += `        // Difficulty filtering: easy=first third, normal=middle, hard=last third\n`;
    code += `        let pool = bank;\n`;
    code += `        if (difficulty === 1) pool = bank.slice(0, Math.ceil(bank.length * 0.4));\n`;
    code += `        else if (difficulty === 3) pool = bank.slice(Math.floor(bank.length * 0.6));\n`;
    code += `        const q = pool[Math.floor(Math.random() * pool.length)];\n`;
    code += `        return { text: q.text, answer: q.answer, options: q.options };\n`;
    code += `    }\n`;
    code += `};\n`;

    return code;
}

// ==========================================
// MAIN
// ==========================================
async function main() {
    const subject = process.argv[2];

    if (!subject || !SUBJECTS[subject]) {
        console.log('📚 Asignaturas disponibles:');
        Object.entries(SUBJECTS).forEach(([key, val]) => {
            console.log(`   ${val.icon} ${key} — ${val.name}`);
        });
        console.log(`\nUso: node generate/ai_generator.js <asignatura>`);
        console.log(`Ejemplo: node generate/ai_generator.js lenguaje`);
        return;
    }

    const subj = SUBJECTS[subject];
    console.log(`\n🚀 Generando banco de preguntas para: ${subj.icon} ${subj.name}\n`);

    const questionsByLevel = {};
    const levels = Object.entries(subj.levels);

    for (const [level, config] of levels) {
        console.log(`  📝 Nivel ${level} (${config.description})...`);
        try {
            const questions = await callOpenAI(config.prompt);
            questionsByLevel[level] = questions;
            console.log(`     ✅ ${questions.length} preguntas generadas`);
        } catch (err) {
            console.error(`     ❌ Error: ${err.message}`);
            questionsByLevel[level] = [];
        }
    }

    // Generate module file
    const moduleCode = generateModuleFile(subject, questionsByLevel);
    const outputPath = path.join(__dirname, '..', 'questions', `${subject}.js`);
    fs.writeFileSync(outputPath, moduleCode, 'utf-8');

    const totalQ = Object.values(questionsByLevel).reduce((sum, arr) => sum + arr.length, 0);
    console.log(`\n✅ ¡Listo! ${totalQ} preguntas guardadas en questions/${subject}.js\n`);
}

main().catch(err => {
    console.error('❌ Error fatal:', err.message);
    process.exit(1);
});
