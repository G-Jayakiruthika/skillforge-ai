"""
knowledge.py - SkillForge AI knowledge base.

Everything the agents "know" lives here so it can be edited without touching
agent logic:
  * skill taxonomy + synonyms (ESCO-style codes)
  * prerequisite graph (used for the topological learning roadmap)
  * job-role benchmarks (required proficiency 0-100 per skill)
  * curated learning resources (course / tutorial / practice / video)
  * assessment bank: MCQs tagged with the *concept* they test, plus
    concept keywords used to grade free-text / voice explanations.
"""
from __future__ import annotations

from typing import Any, Dict, List

# ---------------------------------------------------------------------------
# Taxonomy
# ---------------------------------------------------------------------------
SYNONYMS: Dict[str, str] = {
    # web
    "html": "HTML/CSS", "css": "HTML/CSS", "html5": "HTML/CSS", "css3": "HTML/CSS",
    "html/css": "HTML/CSS", "html & css": "HTML/CSS", "html and css": "HTML/CSS",
    "basic html": "HTML/CSS", "bootstrap": "HTML/CSS", "tailwind": "HTML/CSS",
    "js": "JavaScript", "javascript": "JavaScript", "vanilla js": "JavaScript",
    "es6": "JavaScript", "ecmascript": "JavaScript", "jquery": "JavaScript",
    "ts": "TypeScript", "typescript": "TypeScript",
    "react": "React", "reactjs": "React", "react.js": "React", "next.js": "React", "nextjs": "React",
    "node": "Node.js", "nodejs": "Node.js", "node.js": "Node.js", "express": "Node.js", "expressjs": "Node.js",
    "rest": "REST APIs", "rest api": "REST APIs", "rest apis": "REST APIs", "api": "REST APIs",
    "apis": "REST APIs", "fastapi": "REST APIs", "flask": "REST APIs", "django": "REST APIs",
    "git": "Git", "github": "Git", "gitlab": "Git", "version control": "Git",
    "docker": "Docker", "containers": "Docker", "kubernetes": "Docker",
    # data
    "python": "Python", "py": "Python", "python3": "Python",
    "sql": "SQL", "mysql": "SQL", "postgres": "SQL", "postgresql": "SQL", "sqlite": "SQL",
    "oracle": "SQL", "dbms": "SQL", "rdbms": "SQL", "plsql": "SQL",
    "data modeling": "Data Modeling", "data modelling": "Data Modeling", "etl": "Data Modeling",
    "star schema": "Data Modeling", "data warehouse": "Data Modeling", "data warehousing": "Data Modeling",
    "spark": "Apache Spark", "pyspark": "Apache Spark", "apache spark": "Apache Spark",
    "airflow": "Airflow", "apache airflow": "Airflow",
    "pandas": "Pandas", "numpy": "Pandas", "data analysis": "Pandas",
    "statistics": "Statistics", "stats": "Statistics", "probability": "Statistics",
    "power bi": "Power BI", "powerbi": "Power BI", "tableau": "Power BI",
    "dashboards": "Power BI",
}

ESCO_CODES: Dict[str, str] = {
    "HTML/CSS": "ESCO:S5.1.1 Web markup & styling",
    "JavaScript": "ESCO:S5.1.2 Client-side scripting",
    "TypeScript": "ESCO:S5.1.3 Typed scripting",
    "React": "ESCO:S5.2.1 Front-end frameworks",
    "Node.js": "ESCO:S5.3.1 Server-side runtime",
    "REST APIs": "ESCO:S5.3.2 Web service design",
    "Git": "ESCO:S5.6.1 Version control",
    "Docker": "ESCO:S5.6.2 Containerisation",
    "Python": "ESCO:S5.4.1 General-purpose programming",
    "SQL": "ESCO:S5.5.1 Relational databases",
    "Data Modeling": "ESCO:S5.7.1 Database design",
    "Apache Spark": "ESCO:S5.8.1 Distributed computing",
    "Airflow": "ESCO:S5.8.2 Workflow orchestration",
    "Pandas": "ESCO:S5.9.1 Data wrangling",
    "Statistics": "ESCO:S5.9.2 Statistical analysis",
    "Power BI": "ESCO:S5.9.3 Data visualisation",
}

PREREQUISITES: Dict[str, List[str]] = {
    "HTML/CSS": [], "Git": [], "SQL": [], "Python": [], "Statistics": [],
    "JavaScript": ["HTML/CSS"],
    "TypeScript": ["JavaScript"],
    "React": ["JavaScript"],
    "Node.js": ["JavaScript"],
    "REST APIs": ["Python|Node.js"],   # "A|B" = either one satisfies the gate
    "Docker": ["Git"],
    "Data Modeling": ["SQL"],
    "Apache Spark": ["Python", "SQL"],
    "Airflow": ["Python"],
    "Pandas": ["Python"],
    "Power BI": ["SQL"],
}

# Required proficiency (0-100) per skill for each role. 60 = can work on it
# with some help, 75 = independent. "weight" is implicit: core skills get
# higher required levels.
ROLE_BENCHMARKS: Dict[str, Dict[str, int]] = {
    "Full Stack Developer": {
        "HTML/CSS": 65, "JavaScript": 70, "React": 65, "Node.js": 65,
        "SQL": 60, "REST APIs": 60, "Git": 55,
    },
    "Frontend Developer": {
        "HTML/CSS": 75, "JavaScript": 75, "TypeScript": 65, "React": 70, "Git": 55,
    },
    "Backend Developer (Python)": {
        "Python": 75, "SQL": 65, "REST APIs": 70, "Docker": 55, "Git": 55,
    },
    "Data Engineer": {
        "Python": 70, "SQL": 75, "Data Modeling": 65, "Apache Spark": 60, "Airflow": 60,
    },
    "Data Analyst": {
        "SQL": 70, "Python": 55, "Pandas": 65, "Statistics": 60, "Power BI": 60,
    },
}

ROLE_DESCRIPTIONS: Dict[str, str] = {
    "Full Stack Developer": "Builds both the browser UI and the server/database behind it.",
    "Frontend Developer": "Builds fast, accessible user interfaces in the browser.",
    "Backend Developer (Python)": "Designs APIs, databases and services in Python.",
    "Data Engineer": "Builds reliable pipelines that move and model data at scale.",
    "Data Analyst": "Turns data into answers with SQL, Python and dashboards.",
}

LEVEL_SCORES = {"beginner": 30, "basic": 30, "intermediate": 55, "advanced": 75, "expert": 85}

MASTERY_PASS = 60      # assessment score needed to pass a milestone
WORKING_LEVEL = 55     # proficiency at which a skill unlocks dependants

# ---------------------------------------------------------------------------
# Skills: resources, micro-project, quiz bank, explanation rubric
# ---------------------------------------------------------------------------
def _yt(q: str) -> str:
    return "https://www.youtube.com/results?search_query=" + q.replace(" ", "+")


SKILLS: Dict[str, Dict[str, Any]] = {
    "HTML/CSS": {
        "hours": 12,
        "resources": [
            {"type": "course", "title": "MDN: Learn web development (HTML & CSS)", "url": "https://developer.mozilla.org/en-US/docs/Learn", "hours": 6},
            {"type": "practice", "title": "Flexbox Froggy (game)", "url": "https://flexboxfroggy.com/", "hours": 1},
            {"type": "practice", "title": "Grid Garden (game)", "url": "https://cssgridgarden.com/", "hours": 1},
            {"type": "video", "title": "HTML & CSS crash course (video search)", "url": _yt("html css crash course beginners"), "hours": 2},
        ],
        "project": "Build a responsive personal profile page with a CSS Grid layout and a mobile breakpoint.",
        "explain_prompt": "Explain the difference between Flexbox and CSS Grid, and when you would use each.",
        "concepts": {
            "layout": ["flexbox", "grid", "row", "column", "two-dimensional", "one-dimensional", "2d", "1d"],
            "semantics": ["semantic", "header", "nav", "main", "section", "accessibility"],
            "responsive": ["media query", "responsive", "breakpoint", "mobile"],
        },
        "quiz": [
            {"q": "Which layout model is designed for two-dimensional (rows AND columns) layouts?", "options": ["Flexbox", "CSS Grid", "float", "inline-block"], "answer": 1, "concept": "layout"},
            {"q": "Which tag best marks up the main navigation links of a page?", "options": ["<div class='nav'>", "<nav>", "<section>", "<span>"], "answer": 1, "concept": "semantics"},
            {"q": "What makes a page change layout on small screens?", "options": ["A media query", "An <iframe>", "The alt attribute", "A <table>"], "answer": 0, "concept": "responsive"},
        ],
    },
    "JavaScript": {
        "hours": 20,
        "resources": [
            {"type": "course", "title": "javascript.info - The Modern JavaScript Tutorial", "url": "https://javascript.info/", "hours": 10},
            {"type": "tutorial", "title": "MDN JavaScript Guide", "url": "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide", "hours": 4},
            {"type": "practice", "title": "freeCodeCamp JavaScript certification", "url": "https://www.freecodecamp.org/learn", "hours": 4},
            {"type": "video", "title": "JavaScript event loop explained (video search)", "url": _yt("javascript event loop explained"), "hours": 1},
        ],
        "project": "Build a to-do app that saves tasks in localStorage and fetches a quote from a public API with async/await.",
        "explain_prompt": "Explain how promises and setTimeout are scheduled by the JavaScript event loop.",
        "concepts": {
            "async": ["promise", "async", "await", "then", "callback"],
            "event_loop": ["event loop", "microtask", "macrotask", "call stack", "queue", "settimeout"],
            "dom": ["dom", "document", "queryselector", "event listener", "addeventlistener"],
        },
        "quiz": [
            {"q": "After the call stack clears, which queue runs first?", "options": ["Macrotask queue (setTimeout)", "Microtask queue (Promises)", "Paint queue", "Worker queue"], "answer": 1, "concept": "event_loop"},
            {"q": "What does `await` do inside an async function?", "options": ["Blocks the whole browser", "Pauses that function until the promise settles", "Creates a new thread", "Converts code to synchronous Java"], "answer": 1, "concept": "async"},
            {"q": "Which method attaches a click handler to an element?", "options": ["element.onClickHandler()", "element.addEventListener('click', fn)", "document.click(fn)", "element.bind('click')"], "answer": 1, "concept": "dom"},
        ],
    },
    "TypeScript": {
        "hours": 10,
        "resources": [
            {"type": "course", "title": "TypeScript Handbook", "url": "https://www.typescriptlang.org/docs/handbook/intro.html", "hours": 5},
            {"type": "practice", "title": "TypeScript Playground", "url": "https://www.typescriptlang.org/play", "hours": 2},
            {"type": "video", "title": "TypeScript for beginners (video search)", "url": _yt("typescript tutorial for beginners"), "hours": 2},
        ],
        "project": "Convert your JavaScript to-do app to TypeScript with interfaces for every data shape.",
        "explain_prompt": "Explain what an interface is in TypeScript and why types catch bugs early.",
        "concepts": {
            "types": ["type", "interface", "string", "number", "compile", "compile-time"],
            "generics": ["generic", "<t>", "reusable"],
            "safety": ["error", "catch", "bug", "safety", "strict"],
        },
        "quiz": [
            {"q": "When are TypeScript type errors reported?", "options": ["At compile time", "Only in production", "Never", "Only in the browser console"], "answer": 0, "concept": "safety"},
            {"q": "What does an `interface` describe?", "options": ["A CSS class", "The shape of an object", "A database table", "A loop"], "answer": 1, "concept": "types"},
            {"q": "`function first<T>(arr: T[]): T` is an example of…", "options": ["A generic", "A decorator", "An enum", "A union"], "answer": 0, "concept": "generics"},
        ],
    },
    "React": {
        "hours": 18,
        "resources": [
            {"type": "course", "title": "react.dev - Learn React (official)", "url": "https://react.dev/learn", "hours": 8},
            {"type": "tutorial", "title": "react.dev - Tutorial: Tic-Tac-Toe", "url": "https://react.dev/learn/tutorial-tic-tac-toe", "hours": 3},
            {"type": "practice", "title": "freeCodeCamp Front End Libraries", "url": "https://www.freecodecamp.org/learn", "hours": 4},
            {"type": "video", "title": "React hooks explained (video search)", "url": _yt("react hooks useState useEffect explained"), "hours": 2},
        ],
        "project": "Build a skill-tracker UI: a list of components with useState, a filter box, and data loaded with useEffect.",
        "explain_prompt": "Explain what state is in React and why changing state re-renders a component.",
        "concepts": {
            "state": ["state", "usestate", "setstate", "re-render", "rerender", "render"],
            "effects": ["useeffect", "effect", "dependency", "side effect", "fetch"],
            "components": ["component", "props", "jsx", "reusable"],
        },
        "quiz": [
            {"q": "What happens when you call a state setter from useState?", "options": ["Nothing until page reload", "React schedules a re-render with the new state", "The DOM is deleted", "The component unmounts"], "answer": 1, "concept": "state"},
            {"q": "What is the dependency array of useEffect for?", "options": ["Styling", "Controlling when the effect re-runs", "Importing packages", "Declaring props"], "answer": 1, "concept": "effects"},
            {"q": "How does a parent pass data to a child component?", "options": ["Props", "localStorage only", "Global CSS", "It cannot"], "answer": 0, "concept": "components"},
        ],
    },
    "Node.js": {
        "hours": 16,
        "resources": [
            {"type": "course", "title": "Node.js - Learn (official)", "url": "https://nodejs.org/en/learn", "hours": 6},
            {"type": "tutorial", "title": "MDN: Express/Node introduction", "url": "https://developer.mozilla.org/en-US/docs/Learn/Server-side/Express_Nodejs", "hours": 5},
            {"type": "video", "title": "Node + Express REST API (video search)", "url": _yt("node express rest api tutorial"), "hours": 3},
        ],
        "project": "Build an Express API with routes for /tasks (GET, POST, DELETE) storing data in SQLite.",
        "explain_prompt": "Explain why Node.js uses non-blocking I/O and what middleware does in Express.",
        "concepts": {
            "non_blocking": ["non-blocking", "nonblocking", "event loop", "async", "single thread", "single-threaded"],
            "middleware": ["middleware", "next", "request", "response", "req", "res"],
            "modules": ["npm", "module", "require", "import", "package.json"],
        },
        "quiz": [
            {"q": "Why should you avoid long synchronous work in a Node server?", "options": ["It uses too much CSS", "It blocks the single event loop for all users", "Node forbids loops", "It deletes node_modules"], "answer": 1, "concept": "non_blocking"},
            {"q": "In Express, what does calling next() inside middleware do?", "options": ["Restarts the server", "Passes control to the next handler", "Sends a 404", "Closes the DB"], "answer": 1, "concept": "middleware"},
            {"q": "Which file lists a Node project's dependencies?", "options": ["index.html", "package.json", "requirements.txt", "pom.xml"], "answer": 1, "concept": "modules"},
        ],
    },
    "REST APIs": {
        "hours": 10,
        "resources": [
            {"type": "tutorial", "title": "MDN: An overview of HTTP", "url": "https://developer.mozilla.org/en-US/docs/Web/HTTP/Overview", "hours": 2},
            {"type": "course", "title": "FastAPI tutorial (Python)", "url": "https://fastapi.tiangolo.com/tutorial/", "hours": 5},
            {"type": "video", "title": "REST API design basics (video search)", "url": _yt("rest api design explained"), "hours": 1},
        ],
        "project": "Design and build a small REST API for a library (books, members, loans) with correct status codes.",
        "explain_prompt": "Explain what makes an API RESTful and which HTTP methods and status codes you would use.",
        "concepts": {
            "methods": ["get", "post", "put", "patch", "delete", "method", "verb"],
            "status": ["status code", "200", "201", "404", "400", "500"],
            "resources": ["resource", "endpoint", "url", "json", "stateless"],
        },
        "quiz": [
            {"q": "Which status code fits 'resource created successfully'?", "options": ["200", "201", "404", "500"], "answer": 1, "concept": "status"},
            {"q": "Which HTTP method should update part of an existing resource?", "options": ["GET", "PATCH", "TRACE", "HEAD"], "answer": 1, "concept": "methods"},
            {"q": "'Stateless' in REST means…", "options": ["The server keeps no client session between requests", "No database allowed", "Only GET requests", "No JSON"], "answer": 0, "concept": "resources"},
        ],
    },
    "Git": {
        "hours": 6,
        "resources": [
            {"type": "practice", "title": "Learn Git Branching (interactive)", "url": "https://learngitbranching.js.org/", "hours": 2},
            {"type": "course", "title": "Pro Git book (free)", "url": "https://git-scm.com/book/en/v2", "hours": 3},
            {"type": "video", "title": "Git & GitHub for beginners (video search)", "url": _yt("git and github for beginners"), "hours": 1},
        ],
        "project": "Put one of your projects on GitHub with a README, 5+ meaningful commits and one merged feature branch.",
        "explain_prompt": "Explain the difference between a commit, a branch and a pull request.",
        "concepts": {
            "commits": ["commit", "snapshot", "history", "staging", "add"],
            "branches": ["branch", "merge", "checkout", "switch", "rebase"],
            "collaboration": ["pull request", "push", "pull", "remote", "github", "review"],
        },
        "quiz": [
            {"q": "Which command records staged changes in history?", "options": ["git push", "git commit", "git clone", "git status"], "answer": 1, "concept": "commits"},
            {"q": "Why use a feature branch?", "options": ["To work in isolation and merge when ready", "To delete history", "To speed up the internet", "Branches are only for admins"], "answer": 0, "concept": "branches"},
            {"q": "What is a pull request?", "options": ["Downloading a repo", "A request to review and merge changes", "A Git error", "A backup"], "answer": 1, "concept": "collaboration"},
        ],
    },
    "Docker": {
        "hours": 8,
        "resources": [
            {"type": "course", "title": "Docker: Get started (official)", "url": "https://docs.docker.com/get-started/", "hours": 4},
            {"type": "practice", "title": "Play with Docker (browser lab)", "url": "https://labs.play-with-docker.com/", "hours": 2},
            {"type": "video", "title": "Docker in 1 hour (video search)", "url": _yt("docker tutorial for beginners"), "hours": 1},
        ],
        "project": "Write a Dockerfile for your REST API and run it with docker compose alongside a database.",
        "explain_prompt": "Explain the difference between a Docker image and a container.",
        "concepts": {
            "images": ["image", "dockerfile", "layer", "build"],
            "containers": ["container", "run", "isolated", "process"],
            "compose": ["compose", "volume", "port", "network"],
        },
        "quiz": [
            {"q": "An image is to a container as…", "options": ["A class is to an object", "CSS is to HTML", "RAM is to disk", "Git is to GitHub"], "answer": 0, "concept": "containers"},
            {"q": "Which file describes how to build an image?", "options": ["Dockerfile", "README.md", ".gitignore", "setup.cfg"], "answer": 0, "concept": "images"},
            {"q": "How do you keep database data when a container is removed?", "options": ["Use a volume", "Use a bigger image", "You can't", "Restart Docker"], "answer": 0, "concept": "compose"},
        ],
    },
    "Python": {
        "hours": 16,
        "resources": [
            {"type": "course", "title": "The Python Tutorial (official)", "url": "https://docs.python.org/3/tutorial/", "hours": 8},
            {"type": "practice", "title": "Exercism Python track", "url": "https://exercism.org/tracks/python", "hours": 5},
            {"type": "video", "title": "Python for beginners (video search)", "url": _yt("python full course beginners"), "hours": 3},
        ],
        "project": "Write a command-line expense tracker that reads/writes a CSV file, with functions and unit tests.",
        "explain_prompt": "Explain the difference between a list and a dictionary in Python and when you would use each.",
        "concepts": {
            "data_structures": ["list", "dictionary", "dict", "tuple", "set", "key", "value", "index"],
            "functions": ["function", "def", "return", "argument", "parameter"],
            "iteration": ["loop", "for", "generator", "yield", "comprehension"],
        },
        "quiz": [
            {"q": "Which structure gives fast lookup of a value by a key?", "options": ["list", "dict", "tuple", "str"], "answer": 1, "concept": "data_structures"},
            {"q": "What does a generator (`yield`) help with?", "options": ["Producing items lazily, saving memory", "Running on GPUs", "Styling output", "Creating databases"], "answer": 0, "concept": "iteration"},
            {"q": "What does `return` do in a function?", "options": ["Prints to screen", "Sends a value back to the caller", "Ends the program", "Imports a module"], "answer": 1, "concept": "functions"},
        ],
    },
    "SQL": {
        "hours": 12,
        "resources": [
            {"type": "practice", "title": "SQLBolt - interactive SQL lessons", "url": "https://sqlbolt.com/", "hours": 3},
            {"type": "course", "title": "PostgreSQL Tutorial", "url": "https://www.postgresqltutorial.com/", "hours": 5},
            {"type": "video", "title": "SQL joins & window functions (video search)", "url": _yt("sql joins window functions tutorial"), "hours": 2},
        ],
        "project": "Design a students-courses-enrolments database and write 10 queries (joins, GROUP BY, a window function).",
        "explain_prompt": "Explain the difference between INNER JOIN and LEFT JOIN with an example.",
        "concepts": {
            "joins": ["join", "inner", "left", "matching", "null", "foreign key"],
            "aggregation": ["group by", "count", "sum", "avg", "having", "aggregate"],
            "windows": ["window", "over", "partition", "row_number", "rank"],
        },
        "quiz": [
            {"q": "LEFT JOIN returns…", "options": ["Only matching rows", "All left rows, with NULLs where no match", "All right rows only", "A cartesian product"], "answer": 1, "concept": "joins"},
            {"q": "Which clause filters groups after aggregation?", "options": ["WHERE", "HAVING", "ORDER BY", "LIMIT"], "answer": 1, "concept": "aggregation"},
            {"q": "Unlike GROUP BY, a window function…", "options": ["Keeps every row while computing across a partition", "Deletes duplicates", "Only works on text", "Creates indexes"], "answer": 0, "concept": "windows"},
        ],
    },
    "Data Modeling": {
        "hours": 10,
        "resources": [
            {"type": "tutorial", "title": "Kimball dimensional modeling techniques", "url": "https://www.kimballgroup.com/data-warehouse-business-intelligence-resources/kimball-techniques/", "hours": 4},
            {"type": "video", "title": "Star schema explained (video search)", "url": _yt("star schema fact dimension tables explained"), "hours": 2},
            {"type": "practice", "title": "dbdiagram.io - draw your schema", "url": "https://dbdiagram.io/", "hours": 2},
        ],
        "project": "Design a star schema for an online store (FactSales + 3 dimensions) and load sample data.",
        "explain_prompt": "Explain what fact and dimension tables are in a star schema.",
        "concepts": {
            "star": ["fact", "dimension", "star schema", "measure"],
            "normalization": ["normalization", "normal form", "3nf", "redundancy"],
            "scd": ["slowly changing", "scd", "history", "type 2"],
        },
        "quiz": [
            {"q": "A fact table mainly stores…", "options": ["Descriptive text", "Measurable events (e.g. sales amount)", "User passwords", "CSS"], "answer": 1, "concept": "star"},
            {"q": "Normalization mainly reduces…", "options": ["Data redundancy", "Query speed", "Security", "Table names"], "answer": 0, "concept": "normalization"},
            {"q": "SCD Type 2 keeps…", "options": ["Only the latest value", "Full history with effective dates", "No data", "Only deleted rows"], "answer": 1, "concept": "scd"},
        ],
    },
    "Apache Spark": {
        "hours": 14,
        "resources": [
            {"type": "course", "title": "PySpark getting started (official)", "url": "https://spark.apache.org/docs/latest/api/python/getting_started/index.html", "hours": 5},
            {"type": "practice", "title": "Kaggle Learn (free notebooks)", "url": "https://www.kaggle.com/learn", "hours": 4},
            {"type": "video", "title": "PySpark tutorial (video search)", "url": _yt("pyspark tutorial for beginners"), "hours": 3},
        ],
        "project": "Process a 1M-row CSV with PySpark: deduplicate, aggregate per day, write Parquet.",
        "explain_prompt": "Explain lazy evaluation in Spark and what causes a shuffle.",
        "concepts": {
            "lazy": ["lazy", "transformation", "action", "dag", "collect", "count"],
            "shuffle": ["shuffle", "wide", "narrow", "join", "groupby", "partition"],
            "dataframes": ["dataframe", "schema", "parquet", "sql"],
        },
        "quiz": [
            {"q": "Spark transformations run when…", "options": ["Immediately", "An action (like count) is called", "You restart", "Never"], "answer": 1, "concept": "lazy"},
            {"q": "Which operation causes a shuffle across executors?", "options": ["filter()", "select()", "groupBy()/join()", "map()"], "answer": 2, "concept": "shuffle"},
            {"q": "A columnar file format popular with Spark is…", "options": ["Parquet", "DOCX", "PNG", "TXT"], "answer": 0, "concept": "dataframes"},
        ],
    },
    "Airflow": {
        "hours": 10,
        "resources": [
            {"type": "course", "title": "Airflow fundamentals tutorial (official)", "url": "https://airflow.apache.org/docs/apache-airflow/stable/tutorial/fundamentals.html", "hours": 4},
            {"type": "video", "title": "Apache Airflow for beginners (video search)", "url": _yt("apache airflow tutorial beginners"), "hours": 2},
        ],
        "project": "Write an Airflow DAG that downloads a CSV daily, cleans it with Python and loads it into SQLite.",
        "explain_prompt": "Explain what a DAG is in Airflow and why tasks should be idempotent.",
        "concepts": {
            "dag": ["dag", "task", "dependency", "schedule", "operator"],
            "idempotency": ["idempotent", "retry", "rerun", "same result", "backfill"],
            "monitoring": ["sla", "alert", "log", "monitor", "fail"],
        },
        "quiz": [
            {"q": "In Airflow, a DAG is…", "options": ["A database", "A set of tasks with dependencies and a schedule", "A Python error", "A cloud bucket"], "answer": 1, "concept": "dag"},
            {"q": "Why should tasks be idempotent?", "options": ["So retries/backfills don't duplicate data", "To run faster", "Airflow requires Java", "To save logs"], "answer": 0, "concept": "idempotency"},
            {"q": "Where do you first look when a task fails?", "options": ["The task logs", "The CSS", "The DNS", "Nowhere"], "answer": 0, "concept": "monitoring"},
        ],
    },
    "Pandas": {
        "hours": 10,
        "resources": [
            {"type": "practice", "title": "Kaggle Learn: Pandas", "url": "https://www.kaggle.com/learn/pandas", "hours": 4},
            {"type": "course", "title": "pandas getting-started tutorials", "url": "https://pandas.pydata.org/docs/getting_started/intro_tutorials/index.html", "hours": 3},
            {"type": "video", "title": "Pandas tutorial (video search)", "url": _yt("pandas tutorial data analysis"), "hours": 2},
        ],
        "project": "Clean a messy sales CSV with pandas (missing values, types, duplicates) and produce a monthly summary.",
        "explain_prompt": "Explain how you would find and handle missing values in a pandas DataFrame.",
        "concepts": {
            "cleaning": ["missing", "nan", "fillna", "dropna", "duplicate", "isnull", "isna"],
            "grouping": ["groupby", "aggregate", "agg", "mean", "sum", "pivot"],
            "selection": ["loc", "iloc", "filter", "column", "dataframe", "series"],
        },
        "quiz": [
            {"q": "Which method removes rows with missing values?", "options": ["df.dropna()", "df.drop_columns()", "df.clean()", "df.nan()"], "answer": 0, "concept": "cleaning"},
            {"q": "df.groupby('city')['sales'].sum() returns…", "options": ["Total sales per city", "One row", "A plot", "An error"], "answer": 0, "concept": "grouping"},
            {"q": "df.loc selects by…", "options": ["Labels", "Integer position only", "Colour", "File name"], "answer": 0, "concept": "selection"},
        ],
    },
    "Statistics": {
        "hours": 12,
        "resources": [
            {"type": "course", "title": "Khan Academy: Statistics & probability", "url": "https://www.khanacademy.org/math/statistics-probability", "hours": 8},
            {"type": "video", "title": "Statistics fundamentals (video search)", "url": _yt("statistics fundamentals mean median standard deviation"), "hours": 2},
        ],
        "project": "Analyse a dataset: report mean, median, standard deviation, and check one hypothesis with a t-test.",
        "explain_prompt": "Explain the difference between mean and median, and when median is the better choice.",
        "concepts": {
            "central": ["mean", "median", "mode", "average", "outlier", "skew"],
            "spread": ["standard deviation", "variance", "range", "spread"],
            "inference": ["hypothesis", "p-value", "significance", "sample", "confidence"],
        },
        "quiz": [
            {"q": "With big outliers (e.g. salaries), which average is more robust?", "options": ["Mean", "Median", "Max", "Sum"], "answer": 1, "concept": "central"},
            {"q": "Standard deviation measures…", "options": ["Spread around the mean", "The middle value", "Sample size", "Correlation"], "answer": 0, "concept": "spread"},
            {"q": "A small p-value (e.g. 0.01) suggests…", "options": ["The result is unlikely under the null hypothesis", "The data is wrong", "The mean is zero", "Nothing"], "answer": 0, "concept": "inference"},
        ],
    },
    "Power BI": {
        "hours": 10,
        "resources": [
            {"type": "course", "title": "Microsoft Learn: Power BI training", "url": "https://learn.microsoft.com/en-us/training/powerplatform/power-bi", "hours": 6},
            {"type": "video", "title": "Power BI full tutorial (video search)", "url": _yt("power bi tutorial for beginners"), "hours": 3},
        ],
        "project": "Build a one-page sales dashboard with a date slicer, KPI cards and a bar chart by region.",
        "explain_prompt": "Explain what a measure is in Power BI and how it differs from a calculated column.",
        "concepts": {
            "modeling": ["relationship", "model", "star", "table"],
            "dax": ["dax", "measure", "calculated column", "calculate", "sum"],
            "visuals": ["visual", "chart", "slicer", "filter", "dashboard", "kpi"],
        },
        "quiz": [
            {"q": "A DAX measure is calculated…", "options": ["At query time in the current filter context", "Once when data loads, row by row", "Only in Excel", "Never"], "answer": 0, "concept": "dax"},
            {"q": "A slicer is used to…", "options": ["Filter visuals interactively", "Delete data", "Write SQL", "Export PDF"], "answer": 0, "concept": "visuals"},
            {"q": "Relationships between tables are defined in the…", "options": ["Model view", "Report title", "Theme", "Bookmark"], "answer": 0, "concept": "modeling"},
        ],
    },
}


# ---------------------------------------------------------------------------
# Multi-industry extension (industries.py) + company catalogue
# ---------------------------------------------------------------------------
from . import industries as _ind  # noqa: E402

SYNONYMS.update(_ind.SYNONYMS)
ESCO_CODES.update(_ind.ESCO_CODES)
PREREQUISITES.update(_ind.PREREQUISITES)
ROLE_BENCHMARKS.update(_ind.ROLE_BENCHMARKS)
ROLE_DESCRIPTIONS.update(_ind.ROLE_DESCRIPTIONS)
SKILLS.update(_ind.SKILLS)
INDUSTRIES = _ind.INDUSTRIES
COMPANIES = _ind.COMPANIES
COMPANY_NOTE = _ind.COMPANY_NOTE
ROLE_INDUSTRY = {r: ind for ind, v in INDUSTRIES.items() for r in v["roles"]}


def skill_hours(skill: str) -> int:
    return int(SKILLS.get(skill, {}).get("hours", 8))
