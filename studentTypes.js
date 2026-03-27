export const generate100StudentTypes = () => {
    // 0, 67, 69, 99, 100 have hardcoded values. The rest are generated algorithmically for exactly 101 unique combinations.
    const adjs = [
        'The Silent', 'The Chaotic', 'The Unpredictable', 'The Calculated', 
        'The Lucky', 'The Stressed', 'The Sleep-Deprived', 'The Caffeinated', 
        'The Confused', 'The Overthinking', 'The Casual', 'The Masterful'
    ];
    const nouns = [
        'Observer', 'Crammer', 'Survivor', 'Strategist', 'Guesser', 
        'Panicker', 'Zombie', 'Addict', 'Wanderer', 'Philosopher', 
        'Passer', 'Tactician'
    ];

    const types = {};

    for (let i = 0; i <= 100; i++) {
        let typeName = "";
        let desc = "";
        let trait = "";
        let focus = Math.min(100, i + 10);
        let social = Math.max(0, 100 - i);
        let clutch = Math.min(100, Math.abs(50 - i) * 2);

        if (i === 100) {
            typeName = "The Flawless Deity 👑";
            desc = "Absolute perfection. The teachers learn from you.";
            trait = "Perfection 🌟";
            social = 20; focus = 100; clutch = 100;
        } else if (i === 99) {
            typeName = "The One Mistake 😢";
            desc = "So close to perfection, that one error haunts you at night.";
            trait = "Tragic Hero 🎭";
            social = 30; focus = 98; clutch = 80;
        } else if (i === 69) {
            typeName = "The Nice Student 😏";
            desc = "You calculated this exactly. You could have scored higher, but aesthetics matter more.";
            trait = "Culture 💯";
            social = 100; focus = 69; clutch = 69;
        } else if (i === 67) {
            typeName = "The 67 Student 💀";
            desc = "A strangely specific score for a strangely specific student. You are an anomaly in the matrix.";
            trait = "Oddity 👽";
            social = 67; focus = 67; clutch = 67;
        } else if (i === 0) {
            typeName = "The Absolute Zero ☠️";
            desc = "You managed to get a zero. It took active, conscious effort to be this wrong.";
            trait = "Entropy 🌪️";
            social = 100; focus = 0; clutch = 0;
        } else {
            const adj = adjs[i % adjs.length];
            const noun = nouns[(i * 3) % nouns.length];
            typeName = `${adj} ${noun} ${i > 80 ? '🔥' : (i > 50 ? '🧠' : '🍃')}`;
            
            if (i > 80) {
                desc = `Scoring ${i} means you're incredibly capable. People rely on you for group projects because you actually read the syllabus.`;
                trait = `Aura Level ${i} ⚡`;
            } else if (i > 50) {
                desc = `A solid ${i}. You perfectly balance barely studying with somehow still surviving. Respect.`;
                trait = `Survivor Instinct 🛡️`;
            } else {
                desc = `Only ${i}/100. Let's be honest, you guessed most of these while half-asleep.`;
                trait = `Pure Luck 🍀`;
            }
        }

        types[i] = { type: typeName, desc, trait, focus, social, clutch };
    }
    return types;
};

export const studentTypesDict = generate100StudentTypes();
