/**
 * 🎓 ARENA MASTER DATABASE (v1.8.5)
 * Dedicated Local Bank for Philippine Content.
 * Reverts other academic topics to Global API.
 */

export const ARENA_QUESTIONS = {
    ph_history: [
        // PRE-COLONIAL
        { text: "What was the early system of government in the Philippines?", correct: "Barangay", options: ["Pueblo", "Barangay", "Canton", "Empire"] },
        { text: "What was the social class of the 'nobles' in early Tagalog society?", correct: "Maharlika", options: ["Timawa", "Maharlika", "Aliping Namamahay", "Datu"] },
        { text: "Who was the first person to circumnavigate the globe (killed in Mactan)?", correct: "Ferdinand Magellan", options: ["Villalobos", "Magellan", "del Cano", "Legazpi"] },
        { text: "What was the blood compact between Legazpi and Sikatuna?", correct: "Sandugo", options: ["Sandugo", "Sumpaan", "Kalyos", "Pacto de Sangre"] },
        { text: "Who was the chief of Mactan who defeated Magellan?", correct: "Lapu-Lapu", options: ["Humabon", "Lapu-Lapu", "Sikatuna", "Dagohoy"] },
        { text: "What script was used by ancient Filipinos for writing?", correct: "Baybayin", options: ["Alibata", "Baybayin", "Sanskrit", "Kawi"] },
        { text: "The first Catholic Mass was held in which island?", correct: "Limasawa", options: ["Cebu", "Limasawa", "Manila", "Homonhon"] },
        { text: "What was the religion of many Southern Filipinos before Spanish arrival?", correct: "Islam", options: ["Hinduism", "Islam", "Buddhism", "Animism"] },
        { text: "Who was the Sultan of Maguindanao when the Spanish arrived?", correct: "Sultan Kudarat", options: ["Kudarat", "Humabon", "Sulayman", "Lakandula"] },
        { text: "Who gave the Philippines its name?", correct: "Ruy Lopez de Villalobos", options: ["Magellan", "Villalobos", "Legazpi", "Philip II"] },

        // REVOLUTIONARY ERA
        { text: "Who was the 'Brain of the Katipunan'?", correct: "Emilio Jacinto", options: ["Mabini", "Jacinto", "Bonifacio", "Rizal"] },
        { text: "Where was the 'Cry of Pugad Lawin' standard location?", correct: "Quezon City", options: ["Caloocan", "Quezon City", "Balintawak", "Paco"] },
        { text: "Who founded the KKK?", correct: "Andres Bonifacio", options: ["Aguinaldo", "Bonifacio", "Jacinto", "Rizal"] },
        { text: "Who was the 'Silence of the North'?", correct: "General Miguel Malvar", options: ["Luna", "Malvar", "Pilar", "Ola"] },
        { text: "Who is the 'Hero of Tirad Pass'?", correct: "Gregorio del Pilar", options: ["Luna", "Pilar", "Aguinaldo", "Poblete"] },
        { text: "Where was Jose Rizal executed?", correct: "Bagumbayan", options: ["Fort Santiago", "Bagumbayan", "Paco Park", "Dapitan"] },
        { text: "What was the name of the ship that brought Rizal to exile?", correct: "SS Cebu", options: ["Victoria", "SS Cebu", "Isla de Panay", "Santa Maria"] },
        { text: "Who wrote 'Mi Ultimo Adios'?", correct: "Jose Rizal", options: ["Rizal", "Bonifacio", "Palma", "Luna"] },
        { text: "The Malolos Republic was established in which church?", correct: "Barasoain Church", options: ["Quiapo", "Manila Cathedral", "Barasoain Church", "San Sebastian"] },
        { text: "Who was the first President of the Philippines?", correct: "Emilio Aguinaldo", options: ["Quezon", "Aguinaldo", "Roxas", "Osmeña"] },
        { text: "Who was the last Filipino general to surrender to Americans?", correct: "Miguel Malvar", options: ["Malvar", "Sakay", "Ola", "Ricarte"] },
        { text: "Who is the 'Mother of the Katipunan'?", correct: "Melchora Aquino", options: ["Silang", "Aquino", "Jesus", "Magbanua"] },
        { text: "The Katipunan was discovered due to a confession to?", correct: "Father Mariano Gil", options: ["Mariano Gil", "Pedro Pelaez", "Jose Burgos", "Gomez"] },
        { text: "What was the secret password of the Katipon member?", correct: "Anak ng Bayan", options: ["GomBurZa", "Anak ng Bayan", "Rizal", "Kalayaan"] },
        { text: "Who is known as the 'Sublime Paralytic'?", correct: "Apolinario Mabini", options: ["Jacinto", "Mabini", "Rizal", "del Pilar"] },

        // AMERICAN & JAPANESE
        { text: "Who said 'I shall return'?", correct: "Douglas MacArthur", options: ["Wainwright", "MacArthur", "Taft", "Pershing"] },
        { text: "What law promised PH independence after 10 years?", correct: "Tydings-McDuffie Law", options: ["Jones Law", "Tydings-McDuffie Law", "Hare-Hawes-Cutting", "Cooper Act"] },
        { text: "The Death March started in Bataan and ended in?", correct: "Capas, Tarlac", options: ["Dau", "Capas, Tarlac", "Clark", "Manila"] },
        { text: "Who was the first American Civil Governor?", correct: "William Howard Taft", options: ["Taft", "MacArthur", "Wood", "Murphy"] },
        { text: "What year did Japan occupy Manila?", correct: "1942", options: ["1941", "1942", "1944", "1945"] },
        { text: "What teachers were brought by US on SS Thomas?", correct: "Thomasites", options: ["Thomasites", "Pensionados", "Missionaries", "Corps"] },
        { text: "Which President died in a plane crash on Mount Manunggal?", correct: "Ramon Magsaysay", options: ["Magsaysay", "Roxas", "Quirino", "Garcia"] },
        { text: "Who was the 'Father of the National Language'?", correct: "Manuel L. Quezon", options: ["Quezon", "Osmeña", "Marcos", "Roxas"] },
        { text: "The 1935 Constitution was signed by which US President?", correct: "Franklin D. Roosevelt", options: ["Taft", "Roosevelt", "Wilson", "Hoover"] },

        // MODERN ERA
        { text: "Who declared Martial Law in 1972?", correct: "Ferdinand Marcos Sr.", options: ["Macapagal", "Marcos Sr.", "Aquino", "Ramos"] },
        { text: "Who was the first female president of PH?", correct: "Corazon Aquino", options: ["Arroyo", "Aquino", "Santiago", "Marcos"] },
        { text: "The 1986 People Power occurred in which avenue?", correct: "EDSA", options: ["Roxas Blvd", "EDSA", "Ayala", "Aurora"] },
        { text: "Who is the 'Father of Local Autonomy'?", correct: "Aquilino Pimentel Jr.", options: ["Pimentel", "Marcos", "Quezon", "Aquino"] },
        { text: "Who was the President during the Centennial Celebration (1998)?", correct: "Joseph Estrada", options: ["Ramos", "Estrada", "Arroyo", "Aquino"] },
        { text: "Which President shifted Independence to June 12?", correct: "Diosdado Macapagal", options: ["Macapagal", "Garcia", "Marcos", "Magsaysay"] },
        { text: "Who is the proponent of the 'Filipino First' policy?", correct: "Carlos P. Garcia", options: ["Garcia", "Quirino", "Roxas", "Luz"] },
        { text: "The 'K-12' education program started under?", correct: "Benigno Aquino III", options: ["Arroyo", "Aquino III", "Duterte", "Marcos Jr"] },
        { text: "Who was the 'Idol of the Masses'?", correct: "Ramon Magsaysay", options: ["Estrada", "Magsaysay", "Marcos", "Quezon"] },
        
        // (Adding bulk to ph_history through regional events - expanding to high entropy)
        { text: "The Dagohoy Rebellion lasted for how many years?", correct: "85 years", options: ["10 years", "50 years", "85 years", "100 years"] },
        { text: "Who was the British general who occupied Manila in 1762?", correct: "William Draper", options: ["Draper", "Cornwallis", "Smith", "Legazpi"] },
        { text: "Who led the first successful revolt in Ilocos?", correct: "Diego Silang", options: ["Silang", "Pule", "Dagohoy", "Bankaw"] },
        { text: "The 'Confradia de San Jose' was led by?", correct: "Hermano Pule", options: ["Pule", "Dagohoy", "Silang", "Sumuroy"] },
        { text: "What was the Spanish name for the Philippines before 'Las Islas Filipinas'?", correct: "Archipelago of St. Lazarus", options: ["St. Lazarus", "Ma-yi", "Maharlika", "San Carlos"] }
    ],
    geography_ph: [
        { text: "What is the capital of the Philippines?", correct: "Manila", options: ["Quezon City", "Manila", "Davao", "Cebu"] },
        { text: "Which province has the most number of islands?", correct: "Pangasinan", options: ["Tawi-Tawi", "Pangasinan", "Palawan", "Sulu"] },
        { text: "The Chocolate Hills is located in?", correct: "Bohol", options: ["Cebu", "Bohol", "Leyte", "Samar"] },
        { text: "What is the highest peak in PH?", correct: "Mount Apo", options: ["Pulag", "Apo", "Mayon", "Pinatubo"] },
        { text: "Which city is the 'Summer Capital'?", correct: "Baguio", options: ["Tagaytay", "Baguio", "Davao", "Vigan"] },
        { text: "What is the longest river in PH?", correct: "Cagayan River", options: ["Pasig", "Cagayan River", "Agusan", "Pampanga"] },
        { text: "The Underground River is found in?", correct: "Palawan", options: ["Palawan", "Surigao", "Bohol", "Cebu"] },
        { text: "Which volcano has a 'perfect cone'?", correct: "Mayon", options: ["Taal", "Mayon", "Hibok-Hibok", "Kanlaon"] },
        { text: "Boracay is in which province?", correct: "Aklan", options: ["Aklan", "Antique", "Capiz", "Iloilo"] },
        { text: "The 'Hundred Islands' is in?", correct: "Pangasinan", options: ["Zambales", "Pangasinan", "La Union", "Ilocos"] },
        { text: "What is the northernmost province?", correct: "Batanes", options: ["Cagayan", "Batanes", "Ilocos", "Cebu"] },
        { text: "The 'Culinary Capital of PH' is?", correct: "Pampanga", options: ["Bulacan", "Pampanga", "Iloilo", "Cebu"] },
        { text: "Which region is known as the 'Bicol Region'?", correct: "Region V", options: ["Region IV", "Region V", "Region VI", "Region VIII"] },
        { text: "What is the largest island in the Philippines?", correct: "Luzon", options: ["Mindanao", "Luzon", "Samar", "Leyte"] },
        { text: "Mount Pulag is famously located in?", correct: "Benguet", options: ["Benguet", "Mountain Prov", "Ifugao", "Kalinga"] },
        { text: "Which city is the 'Tuna Capital'?", correct: "General Santos", options: ["Davao", "General Santos", "Zamboanga", "Iloilo"] },
        { text: "San Juanico Bridge connects Leyte and?", correct: "Samar", options: ["Cebu", "Samar", "Bohol", "Panay"] },
        { text: "The lowest point in PH is found in?", correct: "Philippine Trench", options: ["Marianas", "Philippine Trench", "Sulu Sea", "Subic Bay"] },
        { text: "Which province is known as the 'Best Island in the World'?", correct: "Palawan", options: ["Palawan", "Cebu", "Siargao", "Boracay"] },
        { text: "Siargao is part of which province?", correct: "Surigao del Norte", options: ["Surigao del Norte", "Surigao del Sur", "Agusan", "Davao"] }
    ]
};
