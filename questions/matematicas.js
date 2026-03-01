// ==========================================
// MÓDULO: MATEMÁTICAS 🔢
// ==========================================
// Interface que todo módulo debe implementar:
// {
//   id: string,
//   name: string,
//   icon: string,
//   color: string,
//   answerType: 'numeric' | 'multiple-choice',
//   generateQuestion: function(level, difficulty) => {text, answer} | {text, answer, options}
// }

window.QuestionModules = window.QuestionModules || {};

window.QuestionModules.matematicas = {
    id: 'matematicas',
    name: 'Matemáticas',
    icon: '🔢',
    color: '#00e5ff',
    answerType: 'numeric',

    // difficulty: 1=easy, 2=normal, 3=hard (scales number ranges)
    generateQuestion: function (level, difficulty) {
        difficulty = difficulty || 2;
        let a, b, text, answer;
        const scale = difficulty === 1 ? 0.6 : difficulty === 3 ? 1.5 : 1.0;
        const s = (n) => Math.max(2, Math.round(n * scale));
        // 20% chance of "special" question type per level
        const special = Math.random() < 0.2;

        switch (level) {
            case '1-2':
                if (special) {
                    if (Math.random() < 0.5) {
                        a = Math.floor(Math.random() * s(8)) + 2;
                        answer = Math.floor(Math.random() * s(8)) + 2;
                        text = `${a} + ___ = ${a + answer}`;
                    } else {
                        a = (Math.floor(Math.random() * s(8)) + 2) * 2;
                        answer = a / 2;
                        text = `¿Mitad de ${a}?`;
                    }
                } else if (Math.random() < 0.5) {
                    a = Math.floor(Math.random() * s(15)) + 1;
                    b = Math.floor(Math.random() * s(20 - a)) + 1;
                    text = `${a} + ${b} = ?`; answer = a + b;
                } else {
                    a = Math.floor(Math.random() * s(15)) + s(5);
                    b = Math.floor(Math.random() * a) + 1;
                    text = `${a} − ${b} = ?`; answer = a - b;
                }
                break;

            case '3-4': {
                if (special) {
                    const sp34 = Math.random();
                    if (sp34 < 0.33) {
                        answer = Math.floor(Math.random() * s(9)) + 2;
                        b = Math.floor(Math.random() * s(9)) + 2;
                        text = `___ × ${b} = ${answer * b}`;
                    } else if (sp34 < 0.66) {
                        a = Math.floor(Math.random() * s(50)) + 5;
                        answer = a * 2;
                        text = `¿Doble de ${a}?`;
                    } else {
                        a = Math.floor(Math.random() * s(8)) + 2;
                        b = Math.floor(Math.random() * s(6)) + 2;
                        answer = a * b;
                        const items = ['galletas', 'stickers', 'lápices', 'globos', 'manzanas'];
                        const item = items[Math.floor(Math.random() * items.length)];
                        text = `${a} bolsas con ${b} ${item} cada una = ?`;
                    }
                } else {
                    const r34 = Math.random();
                    if (r34 < 0.3) {
                        a = Math.floor(Math.random() * s(9)) + 2;
                        b = Math.floor(Math.random() * s(9)) + 2;
                        text = `${a} × ${b} = ?`; answer = a * b;
                    } else if (r34 < 0.5) {
                        b = Math.floor(Math.random() * s(9)) + 2;
                        answer = Math.floor(Math.random() * s(9)) + 2;
                        a = b * answer;
                        text = `${a} ÷ ${b} = ?`;
                    } else if (r34 < 0.75) {
                        a = Math.floor(Math.random() * s(80)) + 10;
                        b = Math.floor(Math.random() * s(50)) + 10;
                        text = `${a} + ${b} = ?`; answer = a + b;
                    } else {
                        a = Math.floor(Math.random() * s(80)) + 30;
                        b = Math.floor(Math.random() * (a - 5)) + 5;
                        text = `${a} − ${b} = ?`; answer = a - b;
                    }
                }
                break;
            }

            case '5-6': {
                if (special) {
                    const sp56 = Math.random();
                    if (sp56 < 0.33) {
                        a = Math.floor(Math.random() * s(6)) + 2;
                        answer = Math.floor(Math.random() * s(8)) + 2;
                        const c = Math.floor(Math.random() * 10) + 1;
                        text = `${a} × ___ + ${c} = ${a * answer + c}`;
                    } else if (sp56 < 0.66) {
                        a = Math.floor(Math.random() * s(30)) + 5;
                        answer = a * 3;
                        text = `¿Triple de ${a}?`;
                    } else {
                        a = Math.floor(Math.random() * s(15)) + 5;
                        b = Math.floor(Math.random() * s(8)) + 2;
                        const eaten = Math.floor(Math.random() * 3) + 1;
                        answer = a * b - eaten;
                        text = `${a} cajas de ${b} - ${eaten} usados = ?`;
                    }
                } else {
                    const r56 = Math.random();
                    if (r56 < 0.35) {
                        a = Math.floor(Math.random() * s(9)) + 2;
                        b = Math.floor(Math.random() * s(9)) + 2;
                        const c = Math.floor(Math.random() * s(20)) + 1;
                        if (Math.random() < 0.5) {
                            text = `${a} × ${b} + ${c} = ?`; answer = a * b + c;
                        } else {
                            text = `${a} × ${b} − ${c} = ?`; answer = a * b - c;
                        }
                    } else if (r56 < 0.6) {
                        const denominators = [2, 4, 5, 10];
                        b = denominators[Math.floor(Math.random() * denominators.length)];
                        a = Math.floor(Math.random() * (b - 1)) + 1;
                        const whole = Math.floor(Math.random() * s(50)) + 10;
                        answer = whole * a / b;
                        if (Number.isInteger(answer)) {
                            text = `${a}/${b} de ${whole} = ?`;
                        } else {
                            a = 1; b = 2; const w2 = (Math.floor(Math.random() * 25) + 5) * 2;
                            text = `${a}/${b} de ${w2} = ?`; answer = w2 / 2;
                        }
                    } else {
                        a = Math.floor(Math.random() * s(12)) + 2;
                        b = Math.floor(Math.random() * s(12)) + 2;
                        text = `${a} × ${b} = ?`; answer = a * b;
                    }
                }
                break;
            }

            case '7-8': {
                if (special) {
                    const sp78 = Math.random();
                    if (sp78 < 0.33) {
                        a = Math.floor(Math.random() * s(5)) + 2;
                        const x = Math.floor(Math.random() * s(10)) + 1;
                        answer = Math.floor(Math.random() * s(10)) + 1;
                        text = `${a}·${x} + ___ = ${a * x + answer}`;
                    } else if (sp78 < 0.66) {
                        a = Math.floor(Math.random() * s(10)) + 2;
                        answer = a;
                        text = `√${a * a} = ?`;
                    } else {
                        const percents = [10, 20, 25, 50];
                        a = percents[Math.floor(Math.random() * percents.length)];
                        b = (Math.floor(Math.random() * 10) + 2) * (100 / a);
                        b = Math.round(b);
                        answer = Math.round(b * a / 100);
                        text = `Descuento ${a}% en $${b} = ahorro $?`;
                    }
                } else {
                    const r78 = Math.random();
                    if (r78 < 0.35) {
                        answer = Math.floor(Math.random() * s(20)) + 1;
                        b = Math.floor(Math.random() * s(15)) + 3;
                        a = Math.floor(Math.random() * s(8)) + 2;
                        const result = a * answer + b;
                        text = `${a}x + ${b} = ${result}, x = ?`;
                    } else if (r78 < 0.65) {
                        const percents = [10, 20, 25, 50, 75];
                        a = percents[Math.floor(Math.random() * percents.length)];
                        b = (Math.floor(Math.random() * s(20)) + 2) * (100 / a);
                        b = Math.round(b);
                        answer = Math.round(b * a / 100);
                        text = `${a}% de ${b} = ?`;
                    } else {
                        a = Math.floor(Math.random() * s(15)) + 2;
                        b = Math.floor(Math.random() * s(15)) + 2;
                        answer = a * a + b;
                        text = `${a}² + ${b} = ?`;
                    }
                }
                break;
            }

            default:
                a = Math.floor(Math.random() * s(9)) + 2;
                b = Math.floor(Math.random() * s(9)) + 2;
                text = `${a} × ${b} = ?`; answer = a * b;
        }

        return { text, answer: Math.round(answer) };
    }
};
