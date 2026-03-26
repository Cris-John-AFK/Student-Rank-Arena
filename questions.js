export const questions = [
    // Time Habits
    { id: 1, category: "Time Habits", text: "When do you start assignments?", options: [
        { text: "The day it's assigned 📝", score: 1 },
        { text: "A few days before the deadline", score: 2 },
        { text: "The night before 🌙", score: 3 },
        { text: "10 minutes before submission 🏃", score: 4 }
    ]},
    { id: 2, category: "Time Habits", text: "How many deadlines have you missed?", options: [
        { text: "Zero. I'm perfect. 😇", score: 1 },
        { text: "Maybe one or two, by accident", score: 2 },
        { text: "A few... my professor knows 😅", score: 3 },
        { text: "Deadlines are just suggestions 💀", score: 4 }
    ]},
    { id: 3, category: "Time Habits", text: "How many alarms do you ignore?", options: [
        { text: "I wake up before the alarm", score: 1 },
        { text: "One snooze, then I'm up", score: 2 },
        { text: "At least 3-4 snoozes", score: 3 },
        { text: "I sleep through the nuclear option 🚨", score: 4 }
    ]},

    // Study Behavior
    { id: 4, category: "Study Behavior", text: "Do you actually read modules/readings?", options: [
        { text: "Yes, taking notes and highlighting 📖", score: 1 },
        { text: "I skim the important parts", score: 2 },
        { text: "I read the summary at the end", score: 3 },
        { text: "CTRL+F during the quiz is my reading strategy 🔍", score: 4 }
    ]},
    { id: 5, category: "Study Behavior", text: "How often do you understand lessons?", options: [
        { text: "Almost always, I ask questions 🙋", score: 1 },
        { text: "Most of the time", score: 2 },
        { text: "I just pretend to nod along 🙄", score: 3 },
        { text: "I rely on YouTube Indian guys at 2 AM 🇮🇳", score: 4 }
    ]},
    { id: 6, category: "Study Behavior", text: "Do you review before exams?", options: [
        { text: "A week in advance 🗓️", score: 1 },
        { text: "2 days before", score: 2 },
        { text: "I cram the night before ☕", score: 3 },
        { text: "I review for 5 mins outside the room 🚪", score: 4 }
    ]},

    // Real Behavior
    { id: 7, category: "Real Behavior", text: "Have you submitted empty work before?", options: [
        { text: "Never! My honor! 🛡️", score: 1 },
        { text: "Almost, but I managed to finish", score: 2 },
        { text: "I submitted a corrupted file intentionally 📂", score: 3 },
        { text: "Yes, taking the zero gracefully 🗿", score: 4 }
    ]},
    { id: 8, category: "Real Behavior", text: "Have you Googled answers mid-quiz?", options: [
        { text: "No, that's cheating 🚫", score: 1 },
        { text: "Only to double-check my logic", score: 2 },
        { text: "Sometimes, when I'm desperate 😰", score: 3 },
        { text: "ChatGPT is my co-pilot 🤖", score: 4 }
    ]},
    { id: 9, category: "Real Behavior", text: "Do you copy from classmates?", options: [
        { text: "I'm the one they copy from 👑", score: 1 },
        { text: "Only when we collaborate", score: 2 },
        { text: "I ask for 'references' 👀", score: 3 },
        { text: "Ctrl+C, Ctrl+V, change font 🔄", score: 4 }
    ]},

    // Personality
    { id: 10, category: "Personality", text: "What's your reaction to surprise quizzes?", options: [
        { text: "I'm always ready 🎯", score: 1 },
        { text: "A bit stressed, but okay", score: 2 },
        { text: "Mental breakdown 😭", score: 3 },
        { text: "I laugh because I know I'm failing 😂", score: 4 }
    ]},
    { id: 11, category: "Personality", text: "Do you panic or stay calm?", options: [
        { text: "Calm and collected 🧘", score: 1 },
        { text: "I stress but get it done", score: 2 },
        { text: "Internal screaming, outward smiling 🙃", score: 3 },
        { text: "Panic is my default state 🌪️", score: 4 }
    ]},
    { id: 12, category: "Personality", text: "How often do you say 'kaya pa' (I can still do it)?", options: [
        { text: "Rarely, I manage time well", score: 1 },
        { text: "Sometimes, during midterms", score: 2 },
        { text: "Daily mantra 🙏", score: 3 },
        { text: "My entire academic career is built on 'kaya pa' 🧱", score: 4 }
    ]},

    // Social
    { id: 13, category: "Social", text: "Are you active in group chats?", options: [
        { text: "I'm the leader/organizer 📣", score: 1 },
        { text: "I reply when needed", score: 2 },
        { text: "I just react with 👍", score: 3 },
        { text: "I have it muted permanently 🔕", score: 4 }
    ]},
    { id: 14, category: "Social", text: "Do you carry groupmates?", options: [
        { text: "Yes, I do 90% of the work 🏋️", score: 1 },
        { text: "I do my fair share ⚖️", score: 2 },
        { text: "I do the introduction and formatting 🎨", score: 3 },
        { text: "I'm the designated moral support 👻", score: 4 }
    ]},
    { id: 15, category: "Social", text: "Do you rely on others?", options: [
        { text: "Never, I work best alone", score: 1 },
        { text: "Only for feedback", score: 2 },
        { text: "I ask my friends for help often", score: 3 },
        { text: "My grades depend entirely on my friends 🤝", score: 4 }
    ]},

    // Discipline
    { id: 16, category: "Discipline", text: "Do you follow schedules?", options: [
        { text: "Rigid Notion calendar 📅", score: 1 },
        { text: "Loose mental schedule", score: 2 },
        { text: "I write a to-do list and lose it", score: 3 },
        { text: "What's a schedule? 🤷", score: 4 }
    ]},
    { id: 17, category: "Discipline", text: "Do you procrastinate daily?", options: [
        { text: "No, I'm very efficient", score: 1 },
        { text: "Only when tired", score: 2 },
        { text: "Yes, I'm easily distracted 📱", score: 3 },
        { text: "Procrastination is my lifestyle 🎮", score: 4 }
    ]},
    { id: 18, category: "Discipline", text: "Do you multitask during class?", options: [
        { text: "Never, full attention 👁️", score: 1 },
        { text: "Maybe doodling slightly", score: 2 },
        { text: "Doing assignments for other classes ✍️", score: 3 },
        { text: "I'm literally watching Netflix/TikTok 🍿", score: 4 }
    ]},

    // Performance
    { id: 19, category: "Performance", text: "What's your usual grade?", options: [
        { text: "Uno (1.0) / Flat 1 💯", score: 1 },
        { text: "Line of 2 (1.5 - 2.5) / 80s 📈", score: 2 },
        { text: "Tres (3.0) / 75... pasang awa 🎯", score: 3 },
        { text: "Singko (5.0) / INC / Dropped 💀", score: 4 }
    ]},
    { id: 20, category: "Performance", text: "Do teachers notice you?", options: [
        { text: "Yes, I sit in front and participate 🙋", score: 1 },
        { text: "They know my name", score: 2 },
        { text: "I blend into the background 🥷", score: 3 },
        { text: "They think I dropped the class 👻", score: 4 }
    ]},

    // Honest Ones
    { id: 21, category: "Honest Ones", text: "Do you pretend to listen?", options: [
        { text: "No, I actively listen", score: 1 },
        { text: "I try my best", score: 2 },
        { text: "Eye contact while day-dreaming 💭", score: 3 },
        { text: "I sleep with my eyes open 😴", score: 4 }
    ]},
    { id: 22, category: "Honest Ones", text: "Do you open PDFs or just download?", options: [
        { text: "Open, read, and highlight", score: 1 },
        { text: "Open and skim", score: 2 },
        { text: "Download to 'feel productive' 📥", score: 3 },
        { text: "Downloads folder is a graveyard 🪦", score: 4 }
    ]},
    { id: 23, category: "Honest Ones", text: "Do you skip instructions?", options: [
        { text: "I read every single word twice", score: 1 },
        { text: "I read the bold parts", score: 2 },
        { text: "I guess based on context clues 🕵️", score: 3 },
        { text: "I just start and hope for the best 🚀", score: 4 }
    ]},

    // Pressure Mode
    { id: 24, category: "Pressure Mode", text: "Can you work under pressure?", options: [
        { text: "I prefer working without it", score: 1 },
        { text: "I manage okay", score: 2 },
        { text: "Pressure is the only way I work ⏳", score: 3 },
        { text: "I become a god under pressure ⚡", score: 4 }
    ]},
    { id: 25, category: "Pressure Mode", text: "How fast can you finish a task last minute?", options: [
        { text: "I don't do last minute", score: 1 },
        { text: "An hour or two", score: 2 },
        { text: "Give me 30 mins and some coffee ☕", score: 3 },
        { text: "I can write a 5-page essay in 15 mins 🏎️", score: 4 }
    ]}
];
