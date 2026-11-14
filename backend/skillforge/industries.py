"""
industries.py - multi-industry extension of the knowledge base.

Adds roles and skills beyond software (mechanical, electronics, civil, finance,
business, marketing & design, healthcare, AI), the industry catalogue, and a
list of well-known employers per role for company matching.

Company entries are INDICATIVE: they name roles these employers commonly hire
for and the skills such roles usually emphasise. They are not official
requirements - learners should always check the company's careers page.
Merged into knowledge.py at import time.
"""
from __future__ import annotations

from typing import Any, Dict, List


def _yt(q: str) -> str:
    return "https://www.youtube.com/results?search_query=" + q.replace(" ", "+")


SYNONYMS: Dict[str, str] = {
    "machine learning": "Machine Learning", "ml": "Machine Learning", "scikit-learn": "Machine Learning",
    "sklearn": "Machine Learning", "deep learning": "Machine Learning", "tensorflow": "Machine Learning", "pytorch": "Machine Learning",
    "autocad": "CAD Design", "solidworks": "CAD Design", "catia": "CAD Design", "creo": "CAD Design", "cad": "CAD Design",
    "fusion 360": "CAD Design", "revit": "CAD Design",
    "gd&t": "GD&T", "gdt": "GD&T", "tolerancing": "GD&T",
    "manufacturing": "Manufacturing Processes", "machining": "Manufacturing Processes", "cnc": "Manufacturing Processes",
    "lean": "Lean Manufacturing", "six sigma": "Lean Manufacturing", "kaizen": "Lean Manufacturing", "5s": "Lean Manufacturing",
    "c": "C Programming", "c programming": "C Programming", "embedded c": "C Programming",
    "microcontroller": "Microcontrollers", "microcontrollers": "Microcontrollers", "arduino": "Microcontrollers",
    "8051": "Microcontrollers", "arm": "Microcontrollers", "stm32": "Microcontrollers",
    "digital electronics": "Digital Electronics", "logic design": "Digital Electronics", "vlsi": "Digital Electronics",
    "iot": "IoT", "internet of things": "IoT", "raspberry pi": "IoT", "mqtt": "IoT",
    "structural analysis": "Structural Analysis", "staad": "Structural Analysis", "staad pro": "Structural Analysis", "etabs": "Structural Analysis",
    "construction management": "Construction Management", "site management": "Construction Management", "primavera": "Construction Management",
    "estimation": "Estimation & Costing", "costing": "Estimation & Costing", "quantity surveying": "Estimation & Costing",
    "accounting": "Financial Accounting", "financial accounting": "Financial Accounting", "tally": "Financial Accounting",
    "gst": "Financial Accounting", "bookkeeping": "Financial Accounting",
    "excel": "Advanced Excel", "ms excel": "Advanced Excel", "advanced excel": "Advanced Excel", "spreadsheets": "Advanced Excel", "vlookup": "Advanced Excel",
    "financial modeling": "Financial Modeling", "financial modelling": "Financial Modeling", "valuation": "Financial Modeling", "dcf": "Financial Modeling",
    "requirements": "Requirements Analysis", "requirement analysis": "Requirements Analysis", "requirements analysis": "Requirements Analysis",
    "business analysis": "Requirements Analysis", "user stories": "Requirements Analysis", "brd": "Requirements Analysis",
    "communication": "Communication", "communication skills": "Communication", "presentation": "Communication",
    "public speaking": "Communication", "spoken english": "Communication",
    "seo": "SEO", "search engine optimization": "SEO",
    "social media": "Social Media Marketing", "social media marketing": "Social Media Marketing", "instagram marketing": "Social Media Marketing",
    "google analytics": "Google Analytics", "ga4": "Google Analytics", "web analytics": "Google Analytics",
    "content writing": "Content Writing", "copywriting": "Content Writing", "blogging": "Content Writing",
    "figma": "UI Design", "ui design": "UI Design", "ui": "UI Design", "adobe xd": "UI Design", "wireframing": "UI Design",
    "user research": "User Research", "ux research": "User Research", "usability testing": "User Research", "ux": "User Research",
    "clinical research": "Clinical Research", "good clinical practice": "Clinical Research",
    "medical terminology": "Medical Terminology", "anatomy": "Medical Terminology", "pharmacology": "Medical Terminology",
}

ESCO_CODES: Dict[str, str] = {
    "Machine Learning": "ESCO:S5.9.4 Machine learning",
    "CAD Design": "ESCO:S6.1.1 Computer-aided design", "GD&T": "ESCO:S6.1.2 Geometric tolerancing",
    "Manufacturing Processes": "ESCO:S6.2.1 Manufacturing processes", "Lean Manufacturing": "ESCO:S6.2.2 Lean production",
    "C Programming": "ESCO:S6.3.1 C programming", "Microcontrollers": "ESCO:S6.3.2 Embedded hardware",
    "Digital Electronics": "ESCO:S6.3.3 Digital circuits", "IoT": "ESCO:S6.3.4 Internet of Things",
    "Structural Analysis": "ESCO:S6.4.1 Structural analysis", "Construction Management": "ESCO:S6.4.2 Construction project management",
    "Estimation & Costing": "ESCO:S6.4.3 Cost estimation",
    "Financial Accounting": "ESCO:S7.1.1 Accounting", "Advanced Excel": "ESCO:S7.1.2 Spreadsheet analysis",
    "Financial Modeling": "ESCO:S7.1.3 Financial modelling",
    "Requirements Analysis": "ESCO:S7.2.1 Business requirements", "Communication": "ESCO:T1.1 Communication",
    "SEO": "ESCO:S7.3.1 Search engine optimisation", "Social Media Marketing": "ESCO:S7.3.2 Social media marketing",
    "Google Analytics": "ESCO:S7.3.3 Web analytics", "Content Writing": "ESCO:S7.3.4 Content creation",
    "UI Design": "ESCO:S7.4.1 Interface design", "User Research": "ESCO:S7.4.2 User research",
    "Clinical Research": "ESCO:S8.1.1 Clinical trials", "Medical Terminology": "ESCO:S8.1.2 Medical terminology",
}

PREREQUISITES: Dict[str, List[str]] = {
    "Machine Learning": ["Python", "Statistics"],
    "CAD Design": [], "GD&T": ["CAD Design"], "Manufacturing Processes": [], "Lean Manufacturing": ["Manufacturing Processes"],
    "C Programming": [], "Digital Electronics": [], "Microcontrollers": ["C Programming", "Digital Electronics"], "IoT": ["Microcontrollers"],
    "Structural Analysis": [], "Construction Management": [], "Estimation & Costing": ["CAD Design"],
    "Financial Accounting": [], "Advanced Excel": [], "Financial Modeling": ["Financial Accounting", "Advanced Excel"],
    "Requirements Analysis": ["Communication"], "Communication": [],
    "SEO": [], "Content Writing": [], "Social Media Marketing": ["Content Writing"], "Google Analytics": [],
    "UI Design": [], "User Research": [],
    "Medical Terminology": [], "Clinical Research": ["Medical Terminology"],
}

ROLE_BENCHMARKS: Dict[str, Dict[str, int]] = {
    "Machine Learning Engineer": {"Python": 75, "Statistics": 65, "Machine Learning": 70, "SQL": 55, "Git": 55},
    "Mechanical Design Engineer": {"CAD Design": 75, "GD&T": 60, "Manufacturing Processes": 65, "Lean Manufacturing": 50, "Communication": 55},
    "Embedded Systems Engineer": {"C Programming": 75, "Digital Electronics": 65, "Microcontrollers": 70, "IoT": 55, "Git": 50},
    "Civil Site Engineer": {"CAD Design": 60, "Structural Analysis": 65, "Construction Management": 65, "Estimation & Costing": 60, "Communication": 55},
    "Financial Analyst": {"Financial Accounting": 70, "Advanced Excel": 75, "Financial Modeling": 65, "Statistics": 50, "Power BI": 50},
    "Business Analyst": {"Requirements Analysis": 70, "SQL": 60, "Advanced Excel": 65, "Power BI": 60, "Communication": 70},
    "Digital Marketing Executive": {"SEO": 65, "Social Media Marketing": 65, "Google Analytics": 60, "Content Writing": 65, "Communication": 60},
    "UI/UX Designer": {"UI Design": 75, "User Research": 65, "HTML/CSS": 50, "Communication": 60},
    "Clinical Research Associate": {"Medical Terminology": 70, "Clinical Research": 70, "Advanced Excel": 50, "Communication": 65},
}

ROLE_DESCRIPTIONS: Dict[str, str] = {
    "Machine Learning Engineer": "Builds and ships models that learn from data.",
    "Mechanical Design Engineer": "Designs parts and assemblies that can be manufactured reliably.",
    "Embedded Systems Engineer": "Programs the microcontrollers inside devices, vehicles and machines.",
    "Civil Site Engineer": "Plans, estimates and supervises construction on site.",
    "Financial Analyst": "Analyses financial data to support business and investment decisions.",
    "Business Analyst": "Turns business problems into clear requirements and data-backed decisions.",
    "Digital Marketing Executive": "Grows audiences and sales through search, social and content.",
    "UI/UX Designer": "Designs digital products that are easy and pleasant to use.",
    "Clinical Research Associate": "Monitors clinical trials so they are safe, ethical and accurate.",
}

INDUSTRIES: Dict[str, Dict[str, Any]] = {
    "Software & IT": {"icon": "💻", "color": "#3cf0ff", "roles": ["Full Stack Developer", "Frontend Developer", "Backend Developer (Python)"]},
    "Data & AI": {"icon": "🧠", "color": "#8b5cff", "roles": ["Data Engineer", "Data Analyst", "Machine Learning Engineer"]},
    "Mechanical & Manufacturing": {"icon": "⚙️", "color": "#ffb547", "roles": ["Mechanical Design Engineer"]},
    "Electronics & Embedded": {"icon": "🔌", "color": "#9dff6a", "roles": ["Embedded Systems Engineer"]},
    "Civil & Construction": {"icon": "🏗️", "color": "#ff7a59", "roles": ["Civil Site Engineer"]},
    "Finance & Commerce": {"icon": "📊", "color": "#4dd5a6", "roles": ["Financial Analyst"]},
    "Business & Management": {"icon": "🧩", "color": "#5b8cff", "roles": ["Business Analyst"]},
    "Marketing & Design": {"icon": "🎨", "color": "#ff3ea5", "roles": ["Digital Marketing Executive", "UI/UX Designer"]},
    "Healthcare & Life Sciences": {"icon": "🧬", "color": "#ff4d5e", "roles": ["Clinical Research Associate"]},
}

# name, sector, type, roles, focus skills (+5 required level), typical selection steps
_C = [
    ("TCS", "IT services", "Service", ["Full Stack Developer", "Backend Developer (Python)", "Data Analyst", "Business Analyst"], ["SQL", "Communication"], "Aptitude test → technical interview → HR"),
    ("Infosys", "IT services", "Service", ["Full Stack Developer", "Frontend Developer", "Backend Developer (Python)", "Data Engineer"], ["JavaScript", "SQL"], "Online test (aptitude + coding) → technical + HR interview"),
    ("Wipro", "IT services", "Service", ["Full Stack Developer", "Backend Developer (Python)", "Embedded Systems Engineer"], ["Git", "C Programming"], "Online assessment → technical interview → HR"),
    ("HCLTech", "IT services", "Service", ["Full Stack Developer", "Embedded Systems Engineer", "Data Engineer"], ["C Programming", "SQL"], "Aptitude + coding test → interviews"),
    ("Accenture", "Consulting & technology", "Consulting", ["Full Stack Developer", "Business Analyst", "Data Analyst", "Digital Marketing Executive"], ["Communication", "Requirements Analysis"], "Cognitive + technical test → communication test → interview"),
    ("Cognizant", "IT services", "Service", ["Full Stack Developer", "Data Analyst", "Clinical Research Associate"], ["SQL", "Communication"], "Aptitude test → technical interview → HR"),
    ("Capgemini", "Consulting & technology", "Service", ["Frontend Developer", "Backend Developer (Python)", "Business Analyst"], ["JavaScript", "Communication"], "Pseudo-code + aptitude test → interviews"),
    ("Zoho", "SaaS products", "Product", ["Full Stack Developer", "Frontend Developer", "UI/UX Designer"], ["JavaScript", "C Programming"], "Programming rounds (logic-heavy) → technical interviews"),
    ("Freshworks", "SaaS products", "Product", ["Full Stack Developer", "Frontend Developer", "Digital Marketing Executive"], ["React", "REST APIs"], "Coding test → technical interviews → culture fit"),
    ("Google", "Internet & cloud", "Product", ["Backend Developer (Python)", "Machine Learning Engineer", "UI/UX Designer"], ["Python", "Machine Learning"], "Online challenge → several technical interviews"),
    ("Microsoft", "Software & cloud", "Product", ["Full Stack Developer", "Machine Learning Engineer", "Data Engineer"], ["Git", "Python"], "Online coding test → technical interviews"),
    ("Amazon", "E-commerce & cloud", "Product", ["Backend Developer (Python)", "Data Engineer", "Business Analyst"], ["SQL", "REST APIs"], "Online assessment → technical + behavioural interviews"),
    ("Flipkart", "E-commerce", "Product", ["Full Stack Developer", "Data Analyst", "UI/UX Designer"], ["React", "SQL"], "Coding / case round → interviews"),
    ("Swiggy", "Consumer tech", "Product", ["Data Analyst", "Backend Developer (Python)", "Digital Marketing Executive"], ["SQL", "Python"], "Assignment or test → interviews"),
    ("Deloitte", "Consulting & audit", "Consulting", ["Business Analyst", "Financial Analyst", "Data Analyst"], ["Advanced Excel", "Communication"], "Aptitude test → group discussion / case → interviews"),
    ("EY", "Consulting & audit", "Consulting", ["Financial Analyst", "Business Analyst"], ["Financial Accounting", "Advanced Excel"], "Online test → technical + partner interview"),
    ("KPMG", "Consulting & audit", "Consulting", ["Financial Analyst", "Data Analyst"], ["Financial Accounting", "Power BI"], "Aptitude test → interviews"),
    ("HDFC Bank", "Banking", "BFSI", ["Financial Analyst", "Data Analyst", "Business Analyst"], ["Financial Accounting", "Advanced Excel"], "Aptitude test → interviews"),
    ("ICICI Bank", "Banking", "BFSI", ["Financial Analyst", "Business Analyst"], ["Advanced Excel", "Communication"], "Aptitude test → group discussion → interviews"),
    ("Larsen & Toubro", "Engineering & construction", "Core", ["Civil Site Engineer", "Mechanical Design Engineer", "Embedded Systems Engineer"], ["Construction Management", "CAD Design"], "Technical aptitude test → technical + HR interview"),
    ("Tata Motors", "Automotive", "Core", ["Mechanical Design Engineer", "Embedded Systems Engineer"], ["CAD Design", "GD&T"], "Technical test → interviews"),
    ("Mahindra", "Automotive & farm equipment", "Core", ["Mechanical Design Engineer", "Embedded Systems Engineer"], ["Manufacturing Processes", "CAD Design"], "Technical test → interviews"),
    ("Bosch", "Engineering & technology", "Core", ["Embedded Systems Engineer", "Mechanical Design Engineer"], ["C Programming", "Microcontrollers"], "Technical test → technical + HR interview"),
    ("Siemens", "Industrial technology", "Core", ["Embedded Systems Engineer", "Mechanical Design Engineer", "Data Engineer"], ["Digital Electronics", "IoT"], "Online test → interviews"),
    ("Texas Instruments", "Semiconductors", "Core", ["Embedded Systems Engineer"], ["Digital Electronics", "C Programming"], "Technical test (electronics) → interviews"),
    ("Ultratech Cement", "Building materials", "Core", ["Civil Site Engineer"], ["Estimation & Costing", "Construction Management"], "Aptitude test → interviews"),
    ("Ogilvy", "Advertising", "Agency", ["Digital Marketing Executive", "UI/UX Designer"], ["Content Writing", "Social Media Marketing"], "Portfolio / assignment → interviews"),
    ("Apollo Hospitals", "Healthcare", "Healthcare", ["Clinical Research Associate", "Data Analyst"], ["Medical Terminology", "Communication"], "Screening → interviews"),
    ("IQVIA", "Clinical research", "Healthcare", ["Clinical Research Associate", "Data Analyst"], ["Clinical Research", "Advanced Excel"], "Assessment → interviews"),
    ("Biocon", "Biotechnology", "Healthcare", ["Clinical Research Associate", "Data Analyst"], ["Clinical Research", "Statistics"], "Screening → technical + HR interview"),
]
COMPANIES: List[Dict[str, Any]] = [
    {"name": n, "sector": sec, "type": t, "roles": roles, "focus": focus, "process": proc} for n, sec, t, roles, focus, proc in _C
]
COMPANY_NOTE = ("Indicative only: roles these employers commonly hire for and skills such roles usually emphasise. "
                "Always confirm on the company's official careers page.")


def _s(hours, resources, project, explain, concepts, quiz):
    return {"hours": hours, "resources": resources, "project": project, "explain_prompt": explain,
            "concepts": concepts, "quiz": [{"q": q, "options": o, "answer": a, "concept": c} for q, o, a, c in quiz]}


def _r(t, title, url, h):
    return {"type": t, "title": title, "url": url, "hours": h}


SKILLS: Dict[str, Dict[str, Any]] = {
    "Machine Learning": _s(18, [
        _r("course", "Google Machine Learning Crash Course", "https://developers.google.com/machine-learning/crash-course", 10),
        _r("practice", "Kaggle Learn: Intro to Machine Learning", "https://www.kaggle.com/learn/intro-to-machine-learning", 4),
        _r("video", "Machine learning basics (video search)", _yt("machine learning explained for beginners"), 2)],
        "Train a model that predicts house prices, compare two algorithms and report test accuracy.",
        "Explain overfitting and how a train/test split helps you detect it.",
        {"overfitting": ["overfit", "overfitting", "memorize", "generalize", "generalise"], "evaluation": ["test", "train", "split", "validation", "accuracy"], "learning": ["supervised", "label", "feature", "model", "predict"]},
        [("A model scores 99% on training data but 60% on new data. This is…", ["Underfitting", "Overfitting", "Normalisation", "Clustering"], 1, "overfitting"),
         ("Why keep a separate test set?", ["To train faster", "To estimate performance on unseen data", "To store labels", "It is not needed"], 1, "evaluation"),
         ("Predicting a price from labelled examples is…", ["Supervised learning", "Unsupervised learning", "Reinforcement learning", "Data cleaning"], 0, "learning")]),
    "CAD Design": _s(14, [
        _r("course", "Autodesk Fusion / AutoCAD free learning", "https://www.autodesk.com/certification/learn", 6),
        _r("video", "SolidWorks for beginners (video search)", _yt("solidworks tutorial for beginners"), 4),
        _r("practice", "GrabCAD: study real models", "https://grabcad.com/library", 2)],
        "Model a flanged pipe joint in 3D, then produce a fully dimensioned 2D drawing.",
        "Explain the difference between a part, an assembly and a drawing in CAD.",
        {"modeling": ["sketch", "extrude", "revolve", "feature", "part", "3d"], "assembly": ["assembly", "mate", "constraint"], "drawing": ["drawing", "dimension", "view", "orthographic", "2d"]},
        [("Which operation turns a 2D sketch into a 3D solid by pulling it straight out?", ["Extrude", "Fillet", "Mirror", "Chamfer"], 0, "modeling"),
         ("In an assembly, 'mates' are used to…", ["Colour parts", "Position parts relative to each other", "Delete parts", "Export STL"], 1, "assembly"),
         ("Front, top and side views on a drawing are called…", ["Isometric views", "Orthographic views", "Section views only", "Exploded views"], 1, "drawing")]),
    "GD&T": _s(8, [
        _r("tutorial", "GD&T basics (ASME Y14.5 overview)", "https://www.gdandtbasics.com/", 4),
        _r("video", "GD&T explained (video search)", _yt("gd&t explained for beginners"), 2)],
        "Add datums and three geometric tolerances to a bracket drawing and justify each one.",
        "Explain what a datum is and why geometric tolerances are used instead of only ± tolerances.",
        {"datums": ["datum", "reference"], "tolerance": ["tolerance", "flatness", "position", "perpendicular", "runout"], "function": ["fit", "function", "assembly", "interchangeable"]},
        [("A datum in GD&T is…", ["A reference feature for measurements", "A material grade", "A machine type", "A drawing scale"], 0, "datums"),
         ("Which control limits how far a hole's centre may be from its ideal location?", ["Flatness", "Position", "Surface finish", "Colour"], 1, "tolerance"),
         ("Main benefit of GD&T over only ± tolerances:", ["Cheaper paper", "Clearer functional requirements for fit", "No inspection needed", "Faster CAD"], 1, "function")]),
    "Manufacturing Processes": _s(12, [
        _r("course", "NPTEL: Manufacturing processes (search)", "https://nptel.ac.in/courses", 6),
        _r("video", "Manufacturing processes explained (video search)", _yt("manufacturing processes casting machining welding"), 3)],
        "Choose and justify a process route (casting, machining, finishing) for a gear blank.",
        "Explain the difference between casting and machining and when you would choose each.",
        {"casting": ["casting", "mould", "mold", "molten"], "machining": ["machining", "lathe", "milling", "cnc", "cutting"], "selection": ["volume", "cost", "tolerance", "material", "batch"]},
        [("Pouring molten metal into a mould is…", ["Forging", "Casting", "Milling", "Welding"], 1, "casting"),
         ("A CNC lathe mainly produces…", ["Round (rotational) parts", "Sheet metal boxes", "Plastic bags", "Circuit boards"], 0, "machining"),
         ("For 100,000 identical parts, choose a process mainly by…", ["Cost per part at that volume", "The engineer's favourite", "Colour", "Logo size"], 0, "selection")]),
    "Lean Manufacturing": _s(8, [
        _r("tutorial", "Lean Enterprise Institute: what is Lean", "https://www.lean.org/explore-lean/what-is-lean/", 3),
        _r("video", "Lean & 5S explained (video search)", _yt("lean manufacturing 5s kaizen explained"), 2)],
        "Map the value stream of your college canteen and propose three waste reductions.",
        "Explain the idea of 'waste' in Lean and give three examples.",
        {"waste": ["waste", "muda", "waiting", "inventory", "defect", "overproduction", "motion"], "improvement": ["kaizen", "continuous", "improve"], "fivek": ["5s", "sort", "standardize", "sustain"]},
        [("In Lean, waiting time between process steps is…", ["Value-adding", "A form of waste", "Required by law", "A quality check"], 1, "waste"),
         ("Kaizen means…", ["Continuous small improvements", "A big one-time change", "Hiring more people", "Overtime"], 0, "improvement"),
         ("5S starts with…", ["Sort", "Sell", "Scale", "Ship"], 0, "fivek")]),
    "C Programming": _s(16, [
        _r("course", "Learn-C.org interactive tutorial", "https://www.learn-c.org/", 6),
        _r("practice", "Exercism C track", "https://exercism.org/tracks/c", 5),
        _r("video", "C programming full course (video search)", _yt("c programming full course")
        , 4)],
        "Write a C program that reads sensor readings into an array and prints min, max and average using functions and pointers.",
        "Explain what a pointer is in C and why it is useful.",
        {"pointers": ["pointer", "address", "&", "*", "dereference"], "memory": ["memory", "malloc", "free", "stack", "heap"], "types": ["int", "char", "array", "struct"]},
        [("`int *p = &x;` stores in p…", ["The value of x", "The address of x", "A copy of x", "Nothing"], 1, "pointers"),
         ("Memory from malloc() must be released with…", ["delete", "free()", "return", "exit"], 1, "memory"),
         ("A `struct` groups…", ["Related variables of different types", "Only integers", "Functions only", "Files"], 0, "types")]),
    "Digital Electronics": _s(12, [
        _r("course", "All About Circuits: digital textbook", "https://www.allaboutcircuits.com/textbook/digital/", 6),
        _r("video", "Digital electronics basics (video search)", _yt("digital electronics logic gates flip flops"), 3)],
        "Design a 4-bit counter with flip-flops in a free online simulator and verify its truth table.",
        "Explain the difference between combinational and sequential circuits.",
        {"gates": ["and", "or", "not", "nand", "xor", "gate", "logic"], "sequential": ["flip-flop", "flip flop", "clock", "memory", "sequential", "register"], "numbers": ["binary", "hex", "bit"]},
        [("A NAND gate outputs 0 only when…", ["Any input is 0", "All inputs are 1", "All inputs are 0", "Never"], 1, "gates"),
         ("Which circuit has memory of past inputs?", ["Combinational", "Sequential (flip-flops)", "A single resistor", "A diode"], 1, "sequential"),
         ("Binary 1010 in decimal is…", ["8", "10", "12", "20"], 1, "numbers")]),
    "Microcontrollers": _s(14, [
        _r("course", "Arduino: official getting started", "https://docs.arduino.cc/learn/", 5),
        _r("practice", "Wokwi online microcontroller simulator", "https://wokwi.com/", 4),
        _r("video", "Embedded systems basics (video search)", _yt("microcontroller embedded systems basics gpio interrupts"), 3)],
        "Program a microcontroller (Wokwi or real board) to read a temperature sensor and blink an LED above a threshold using an interrupt.",
        "Explain what GPIO pins and interrupts are on a microcontroller.",
        {"gpio": ["gpio", "pin", "input", "output", "digital"], "interrupts": ["interrupt", "isr", "event"], "peripherals": ["adc", "timer", "uart", "i2c", "spi", "pwm"]},
        [("An interrupt lets a microcontroller…", ["React to an event immediately", "Run faster always", "Store more data", "Use less memory"], 0, "interrupts"),
         ("Reading an analog sensor needs the…", ["ADC", "LED", "Reset pin", "Crystal"], 0, "peripherals"),
         ("A GPIO pin set as output can…", ["Drive an LED on/off", "Measure temperature directly", "Store a program", "Connect to Wi-Fi alone"], 0, "gpio")]),
    "IoT": _s(10, [
        _r("tutorial", "MQTT essentials (HiveMQ)", "https://www.hivemq.com/mqtt/", 3),
        _r("practice", "Wokwi ESP32 projects", "https://wokwi.com/", 3),
        _r("video", "IoT for beginners (video search)", _yt("iot project esp32 mqtt beginners"), 2)],
        "Send sensor data from a (simulated) ESP32 to an MQTT broker and show it on a web dashboard.",
        "Explain how an IoT device sends data to the cloud using MQTT.",
        {"protocols": ["mqtt", "http", "publish", "subscribe", "broker"], "devices": ["sensor", "esp32", "device", "edge"], "cloud": ["cloud", "dashboard", "server", "data"]},
        [("MQTT is based on…", ["Publish/subscribe", "Email", "FTP only", "Bluetooth pairing"], 0, "protocols"),
         ("In MQTT, the server that routes messages is the…", ["Broker", "Router", "Compiler", "Sensor"], 0, "protocols"),
         ("Processing data on the device before sending is called…", ["Edge computing", "Cloud storage", "Backup", "Encryption"], 0, "devices")]),
    "Structural Analysis": _s(14, [
        _r("course", "NPTEL: Structural analysis (search)", "https://nptel.ac.in/courses", 7),
        _r("video", "Shear force & bending moment (video search)", _yt("shear force bending moment diagram explained"), 3)],
        "Draw shear force and bending moment diagrams for a simply supported beam with a point load and a UDL.",
        "Explain what a bending moment is and where it is highest in a simply supported beam with a central load.",
        {"loads": ["load", "udl", "point load", "dead", "live"], "moments": ["bending moment", "moment", "shear", "diagram"], "supports": ["support", "reaction", "fixed", "simply supported", "pin"]},
        [("For a simply supported beam with a central point load, maximum bending moment is at…", ["The supports", "Mid-span", "One quarter span", "It is zero everywhere"], 1, "moments"),
         ("A uniformly distributed load (UDL) is…", ["Spread evenly along a length", "Applied at one point", "Only wind load", "A support"], 0, "loads"),
         ("A fixed support resists…", ["Only vertical force", "Forces and moment", "Nothing", "Only temperature"], 1, "supports")]),
    "Construction Management": _s(10, [
        _r("course", "PMI: project management basics", "https://www.pmi.org/learning/library", 4),
        _r("video", "Construction project planning (video search)", _yt("construction project management planning cpm"), 3)],
        "Create a bar chart (Gantt) schedule for a small residential building and identify the critical path.",
        "Explain the critical path and why it matters on a construction site.",
        {"scheduling": ["critical path", "cpm", "gantt", "schedule", "pert"], "safety": ["safety", "ppe", "hazard"], "quality": ["quality", "inspection", "curing", "test"]},
        [("The critical path is…", ["The longest chain of dependent tasks", "The cheapest task", "The site entrance", "A safety rule"], 0, "scheduling"),
         ("PPE on site stands for…", ["Personal protective equipment", "Project plan estimate", "Public payment entry", "Primary pile element"], 0, "safety"),
         ("Concrete cube tests check…", ["Compressive strength", "Colour", "Weight only", "Paint quality"], 0, "quality")]),
    "Estimation & Costing": _s(10, [
        _r("video", "Quantity estimation for buildings (video search)", _yt("building estimation and costing quantity surveying"), 4),
        _r("practice", "Practice: estimate a room in a spreadsheet", "https://support.microsoft.com/en-us/excel", 3)],
        "Estimate brickwork, plaster and concrete quantities for a single room and prepare a cost abstract.",
        "Explain the difference between a detailed estimate and an approximate estimate.",
        {"quantities": ["quantity", "volume", "area", "measurement", "cubic"], "rates": ["rate", "analysis", "cost", "abstract"], "types": ["approximate", "detailed", "plinth area"]},
        [("Concrete quantity is usually measured in…", ["Cubic metres", "Kilograms only", "Square metres only", "Litres"], 0, "quantities"),
         ("A 'rate analysis' works out…", ["Cost per unit of work (material + labour)", "Land price", "Bank interest", "Taxes only"], 0, "rates"),
         ("Plinth area estimate is an example of…", ["Approximate estimate", "Detailed estimate", "Final bill", "Tender"], 0, "types")]),
    "Financial Accounting": _s(14, [
        _r("course", "Khan Academy: accounting & financial statements", "https://www.khanacademy.org/economics-finance-domain/core-finance/accounting-and-financial-stateme", 6),
        _r("video", "Accounting basics (video search)", _yt("accounting basics debit credit financial statements"), 3)],
        "Prepare a trial balance, P&L and balance sheet from 15 sample transactions.",
        "Explain the three main financial statements and what each one shows.",
        {"statements": ["balance sheet", "income statement", "profit", "loss", "cash flow", "p&l"], "double_entry": ["debit", "credit", "double entry", "journal", "ledger"], "equation": ["assets", "liabilities", "equity"]},
        [("The accounting equation is…", ["Assets = Liabilities + Equity", "Profit = Sales", "Cash = Revenue", "Assets = Expenses"], 0, "equation"),
         ("Which statement shows profit over a period?", ["Balance sheet", "Income statement (P&L)", "Bank passbook", "Invoice"], 1, "statements"),
         ("Every transaction has an equal debit and credit — this is…", ["Double-entry bookkeeping", "Single entry", "Auditing", "Taxation"], 0, "double_entry")]),
    "Advanced Excel": _s(10, [
        _r("course", "Microsoft Excel training (official)", "https://support.microsoft.com/en-us/excel", 4),
        _r("practice", "Excel exercises (video search)", _yt("excel pivot table xlookup tutorial"), 3)],
        "Build a monthly sales workbook with XLOOKUP, a pivot table, a chart and conditional formatting.",
        "Explain when you would use a pivot table and when you would use XLOOKUP.",
        {"lookup": ["vlookup", "xlookup", "lookup", "index", "match"], "pivot": ["pivot", "summarize", "summarise", "group"], "formulas": ["sumif", "if", "formula", "countif", "absolute"]},
        [("To summarise sales by region and month quickly, use a…", ["Pivot table", "Text box", "Macro only", "Comment"], 0, "pivot"),
         ("XLOOKUP is used to…", ["Find a value in one range and return a matching value", "Spell-check", "Print", "Protect a sheet"], 0, "lookup"),
         ("In =SUM($A$1:A5), `$A$1` is…", ["An absolute reference", "A text value", "An error", "A chart"], 0, "formulas")]),
    "Financial Modeling": _s(12, [
        _r("course", "Corporate Finance Institute: free resources", "https://corporatefinanceinstitute.com/resources/", 5),
        _r("video", "DCF valuation explained (video search)", _yt("dcf valuation financial modeling explained"), 3)],
        "Build a 3-statement model for a small company and a simple DCF valuation in Excel.",
        "Explain how a discounted cash flow (DCF) valuation works.",
        {"dcf": ["discount", "dcf", "present value", "wacc", "cash flow"], "statements": ["three statement", "3-statement", "balance sheet", "income", "cash flow"], "assumptions": ["assumption", "growth", "sensitivity", "scenario"]},
        [("DCF values a company by…", ["Discounting expected future cash flows to today", "Counting employees", "Using last year's sales only", "Share price only"], 0, "dcf"),
         ("A higher discount rate makes present value…", ["Higher", "Lower", "Unchanged", "Negative always"], 1, "dcf"),
         ("A sensitivity table shows…", ["How outputs change when assumptions change", "Staff feelings", "Tax rules", "Audit status"], 0, "assumptions")]),
    "Requirements Analysis": _s(10, [
        _r("tutorial", "IIBA: what is business analysis", "https://www.iiba.org/business-analysis/", 3),
        _r("video", "Writing user stories (video search)", _yt("how to write user stories acceptance criteria"), 2)],
        "Write 8 user stories with acceptance criteria and a simple process diagram for a library app.",
        "Explain what a user story is and what good acceptance criteria look like.",
        {"stories": ["user story", "as a", "so that", "i want"], "acceptance": ["acceptance criteria", "given", "when", "then", "testable"], "stakeholders": ["stakeholder", "interview", "workshop", "requirement"]},
        [("A user story is usually written as…", ["As a <user>, I want <goal> so that <benefit>", "A SQL query", "A test script", "A contract"], 0, "stories"),
         ("Good acceptance criteria are…", ["Clear and testable", "Long and vague", "Secret", "Optional"], 0, "acceptance"),
         ("People affected by a project are…", ["Stakeholders", "Servers", "Sprints", "Vendors only"], 0, "stakeholders")]),
    "Communication": _s(8, [
        _r("course", "Coursera: improve your English communication (free audit)", "https://www.coursera.org/specializations/improve-english", 4),
        _r("practice", "Practise with the Explain-it voice check in SkillForge", "https://www.youtube.com/results?search_query=STAR+method+interview+answers", 2)],
        "Record a 2-minute self-introduction and a STAR-format answer about a project, then improve it once.",
        "Explain the STAR method for answering interview questions.",
        {"structure": ["situation", "task", "action", "result", "star"], "clarity": ["clear", "simple", "concise", "example"], "listening": ["listen", "question", "feedback"]},
        [("In the STAR method, 'R' stands for…", ["Result", "Reason", "Role", "Review"], 0, "structure"),
         ("A good interview answer is…", ["Clear, specific and backed by an example", "As long as possible", "Memorised word for word", "Only technical terms"], 0, "clarity"),
         ("Active listening means…", ["Paying attention and asking clarifying questions", "Waiting to talk", "Interrupting", "Taking no notes"], 0, "listening")]),
    "SEO": _s(8, [
        _r("course", "Google Search Central: SEO starter guide", "https://developers.google.com/search/docs/fundamentals/seo-starter-guide", 3),
        _r("video", "SEO for beginners (video search)", _yt("seo for beginners keyword research on page"), 2)],
        "Audit a small website: fix titles, meta descriptions and headings, and pick 10 target keywords.",
        "Explain the difference between on-page and off-page SEO.",
        {"onpage": ["title", "meta", "heading", "keyword", "on-page", "content"], "offpage": ["backlink", "off-page", "authority"], "technical": ["speed", "mobile", "sitemap", "crawl", "index"]},
        [("A page's <title> tag mainly affects…", ["How it appears in search results", "Server speed", "Image size", "Database"], 0, "onpage"),
         ("Links from other sites to yours are…", ["Backlinks", "Cookies", "Plugins", "Hashtags"], 0, "offpage"),
         ("A sitemap helps search engines…", ["Discover and crawl your pages", "Pay for ads", "Design logos", "Write blogs"], 0, "technical")]),
    "Social Media Marketing": _s(8, [
        _r("course", "Meta Blueprint free courses", "https://www.facebook.com/business/learn", 4),
        _r("video", "Social media strategy (video search)", _yt("social media marketing strategy beginners"), 2)],
        "Plan a 2-week content calendar for a local business with goals and the metrics you'll track.",
        "Explain engagement rate and why reach alone is not enough.",
        {"metrics": ["engagement", "reach", "impressions", "ctr", "conversion"], "content": ["calendar", "post", "reel", "story", "audience"], "ads": ["targeting", "budget", "campaign", "ad"]},
        [("Engagement rate measures…", ["Interactions relative to audience reached", "Number of posts", "Ad budget", "Follower age"], 0, "metrics"),
         ("A content calendar helps you…", ["Plan posts consistently", "Delete posts", "Hide comments", "Avoid analytics"], 0, "content"),
         ("Paid campaigns let you choose…", ["Targeting and budget", "Your competitor's posts", "Platform rules", "Nothing"], 0, "ads")]),
    "Google Analytics": _s(6, [
        _r("course", "Google Analytics Academy / Skillshop", "https://skillshop.withgoogle.com/", 4),
        _r("video", "GA4 tutorial (video search)", _yt("google analytics 4 tutorial beginners"), 2)],
        "Set up GA4 on a demo site (or use Google's demo account) and report the top 3 traffic sources.",
        "Explain what an event and a conversion are in Google Analytics 4.",
        {"events": ["event", "page_view", "click", "track"], "conversions": ["conversion", "goal", "key event"], "acquisition": ["source", "medium", "traffic", "campaign", "utm"]},
        [("In GA4, almost every interaction is tracked as an…", ["Event", "Invoice", "Email", "Cookie banner"], 0, "events"),
         ("UTM parameters help identify…", ["Where traffic came from", "Server errors", "Font size", "Page colour"], 0, "acquisition"),
         ("A conversion is…", ["An important action you want users to complete", "Any page view", "A bounce", "A server log"], 0, "conversions")]),
    "Content Writing": _s(8, [
        _r("course", "HubSpot Academy: content marketing (free)", "https://academy.hubspot.com/courses/content-marketing", 4),
        _r("video", "Copywriting basics (video search)", _yt("copywriting for beginners headlines"), 2)],
        "Write a 600-word blog post and three headline variations for a product launch.",
        "Explain how you would write for a specific target audience.",
        {"audience": ["audience", "reader", "persona", "target"], "structure": ["headline", "intro", "structure", "call to action", "cta"], "clarity": ["simple", "clear", "short", "edit"]},
        [("The first thing most readers see is the…", ["Headline", "Footer", "Bibliography", "Tags"], 0, "structure"),
         ("A call to action (CTA) tells the reader…", ["What to do next", "The author's age", "The word count", "The font"], 0, "structure"),
         ("Before writing, you should know your…", ["Target audience", "Printer model", "Server IP", "Keyboard layout"], 0, "audience")]),
    "UI Design": _s(12, [
        _r("course", "Figma Learn (official)", "https://help.figma.com/hc/en-us/categories/360002051613", 5),
        _r("tutorial", "Laws of UX", "https://lawsofux.com/", 2),
        _r("video", "UI design fundamentals (video search)", _yt("ui design fundamentals hierarchy spacing"), 3)],
        "Design a 3-screen mobile app in Figma with a consistent grid, type scale and colour styles.",
        "Explain visual hierarchy and how you create it on a screen.",
        {"hierarchy": ["hierarchy", "size", "contrast", "weight", "emphasis"], "layout": ["grid", "spacing", "alignment", "whitespace"], "components": ["component", "style", "design system", "consistency"]},
        [("Making the most important element bigger and bolder creates…", ["Visual hierarchy", "Latency", "A bug", "Clutter"], 0, "hierarchy"),
         ("A layout grid helps with…", ["Consistent alignment and spacing", "Faster internet", "SEO", "Copyright"], 0, "layout"),
         ("Reusable buttons and inputs in Figma are…", ["Components", "Layers only", "Fonts", "Plugins"], 0, "components")]),
    "User Research": _s(8, [
        _r("tutorial", "Nielsen Norman Group: UX research articles", "https://www.nngroup.com/articles/", 4),
        _r("video", "Usability testing (video search)", _yt("usability testing for beginners"), 2)],
        "Run 3 short usability tests on a website, record problems and suggest fixes.",
        "Explain why you should observe users instead of only asking what they want.",
        {"methods": ["interview", "usability test", "survey", "observe", "observation"], "bias": ["bias", "leading question", "neutral"], "insights": ["insight", "pain point", "persona", "journey"]},
        [("Watching people try to complete tasks on a product is…", ["Usability testing", "SEO", "A/B pricing", "Load testing"], 0, "methods"),
         ("'Don't you love this feature?' is a…", ["Leading question", "Neutral question", "Survey scale", "Metric"], 0, "bias"),
         ("A user's main frustration found in research is a…", ["Pain point", "Wireframe", "Sprint", "Backlog"], 0, "insights")]),
    "Clinical Research": _s(12, [
        _r("course", "NIDA Clinical Trials Network: GCP course (free)", "https://gcp.nihtraining.com/", 6),
        _r("tutorial", "WHO: clinical trials overview", "https://www.who.int/health-topics/clinical-trials", 2)],
        "Write a mock monitoring visit report checking consent forms and adverse-event records.",
        "Explain the purpose of informed consent and Good Clinical Practice (GCP).",
        {"ethics": ["informed consent", "consent", "ethics", "ethics committee", "irb"], "phases": ["phase", "phase i", "phase ii", "phase iii", "trial"], "safety": ["adverse event", "safety", "monitoring", "gcp"]},
        [("Informed consent means participants…", ["Voluntarily agree after understanding the trial", "Are paid first", "Are chosen randomly only", "Sign nothing"], 0, "ethics"),
         ("Large trials confirming effectiveness in many patients are usually…", ["Phase I", "Phase III", "Pre-clinical", "Phase 0"], 1, "phases"),
         ("An unwanted medical occurrence in a participant is an…", ["Adverse event", "Endpoint", "Protocol", "Placebo"], 0, "safety")]),
    "Medical Terminology": _s(8, [
        _r("course", "MedlinePlus: understanding medical words", "https://medlineplus.gov/medicalwords.html", 3),
        _r("video", "Medical terminology basics (video search)", _yt("medical terminology prefixes suffixes"), 2)],
        "Make a flash-card deck of 60 prefixes, roots and suffixes and decode 20 real diagnosis terms.",
        "Explain how prefixes, roots and suffixes build medical words, with an example.",
        {"parts": ["prefix", "suffix", "root", "word root"], "examples": ["itis", "cardio", "gastro", "ectomy", "hyper", "hypo"], "meaning": ["inflammation", "removal", "heart", "stomach", "above", "below"]},
        [("The suffix '-itis' means…", ["Inflammation", "Removal", "Study of", "Pain"], 0, "examples"),
         ("'Cardio' refers to the…", ["Heart", "Kidney", "Skin", "Bone"], 0, "examples"),
         ("'Appendectomy' means…", ["Removal of the appendix", "Inflammation of the appendix", "X-ray of the appendix", "Pain"], 0, "meaning")]),
}
