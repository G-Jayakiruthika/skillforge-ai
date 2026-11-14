"""
institutions.py - universities and colleges of Tamil Nadu (starter catalogue).

Source: Wikipedia, "List of institutions of higher education in Tamil Nadu"
(universities, institutes of national importance, government medical colleges,
TNAU constituent colleges and the colleges named on that page), with districts
added. It is NOT every college in the state - Tamil Nadu has 2,000+ affiliated
colleges. Learners whose college is missing choose "My college is not listed"
and type its name. To add more, append a line to RAW:  Name|City|District|Type
Other states can be added the same way with a different STATE value.
"""
from __future__ import annotations

import re
from typing import Any, Dict, List

STATE = "Tamil Nadu"

RAW = """
All India Institute of Medical Sciences, Madurai|Madurai|Madurai|National Institute
Indian Institute of Information Technology, Design and Manufacturing, Kancheepuram|Chennai|Chengalpattu|National Institute
Indian Institute of Information Technology, Tiruchirappalli|Tiruchirappalli|Tiruchirappalli|National Institute
Indian Institute of Management, Tiruchirappalli|Tiruchirappalli|Tiruchirappalli|National Institute
Indian Institute of Technology Madras|Chennai|Chennai|National Institute
Kalakshetra Foundation|Chennai|Chennai|National Institute
National Institute of Food Technology, Entrepreneurship and Management, Thanjavur|Thanjavur|Thanjavur|National Institute
National Institute of Technology, Tiruchirappalli|Tiruchirappalli|Tiruchirappalli|National Institute
Rajiv Gandhi National Institute of Youth Development|Sriperumbudur|Kancheepuram|National Institute
Central University of Tamil Nadu|Tiruvarur|Tiruvarur|Central University
Indian Maritime University|Chennai|Chennai|Central University
Alagappa University|Karaikudi|Sivaganga|State University
Anna University|Chennai|Chennai|State University
Annamalai University|Chidambaram|Cuddalore|State University
Bharathiar University|Coimbatore|Coimbatore|State University
Bharathidasan University|Tiruchirappalli|Tiruchirappalli|State University
Madurai Kamaraj University|Madurai|Madurai|State University
Manonmaniam Sundaranar University|Tirunelveli|Tirunelveli|State University
Mother Teresa Women's University|Kodaikanal|Dindigul|State University
Periyar University|Salem|Salem|State University
Tamil Nadu Agricultural University|Coimbatore|Coimbatore|State University
Tamil Nadu Dr. J. Jayalalithaa Fisheries University|Nagapattinam|Nagapattinam|State University
Tamil Nadu National Law University|Tiruchirappalli|Tiruchirappalli|State University
Tamil Nadu Open University|Chennai|Chennai|State University
Tamil Nadu Physical Education and Sports University|Chennai|Chennai|State University
Tamil Nadu Teachers Education University|Chennai|Chennai|State University
Tamil Nadu Veterinary and Animal Sciences University|Chennai|Chennai|State University
Tamil University|Thanjavur|Thanjavur|State University
The Tamil Nadu Dr. Ambedkar Law University|Chennai|Chennai|State University
The Tamil Nadu Dr. J. Jayalalithaa Music and Fine Arts University|Chennai|Chennai|State University
The Tamil Nadu Dr. M.G.R. Medical University|Chennai|Chennai|State University
Thiruvalluvar University|Vellore|Vellore|State University
University of Madras|Chennai|Chennai|State University
AMET University|Chennai|Chengalpattu|Deemed University
Amrita Vishwa Vidyapeetham|Coimbatore|Coimbatore|Deemed University
Avinashilingam Institute for Home Science and Higher Education for Women|Coimbatore|Coimbatore|Deemed University
B.S. Abdur Rahman Crescent Institute of Science and Technology|Chennai|Chengalpattu|Deemed University
Bharath Institute of Higher Education and Research|Chennai|Chennai|Deemed University
Chennai Mathematical Institute|Kelambakkam|Chengalpattu|Deemed University
Chettinad Academy of Research and Education|Kelambakkam|Chengalpattu|Deemed University
Dr. M.G.R. Educational and Research Institute|Chennai|Chennai|Deemed University
Hindustan Institute of Technology and Science|Chennai|Chengalpattu|Deemed University
Kalasalingam Academy of Research and Education|Krishnankoil|Virudhunagar|Deemed University
Karpagam Academy of Higher Education|Coimbatore|Coimbatore|Deemed University
Karunya Institute of Technology and Sciences|Coimbatore|Coimbatore|Deemed University
Meenakshi Academy of Higher Education and Research|Chennai|Chennai|Deemed University
Noorul Islam Centre for Higher Education|Kumaracoil|Kanyakumari|Deemed University
Periyar Maniammai Institute of Science & Technology|Thanjavur|Thanjavur|Deemed University
Ponnaiyah Ramajayam Institute of Science and Technology (PRIST)|Thanjavur|Thanjavur|Deemed University
Sathyabama Institute of Science and Technology|Chennai|Chennai|Deemed University
Saveetha Institute of Medical and Technical Sciences (SIMATS)|Chennai|Chennai|Deemed University
SASTRA Deemed University|Thanjavur|Thanjavur|Deemed University
Sri Chandrasekharendra Saraswathi Viswa Mahavidyalaya (SCSVMV)|Kancheepuram|Kancheepuram|Deemed University
Sri Ramachandra Institute of Higher Education and Research|Chennai|Chennai|Deemed University
SRM Institute of Science and Technology|Kattankulathur|Chengalpattu|Deemed University
St. Peter's Institute of Higher Education and Research|Chennai|Chennai|Deemed University
The Gandhigram Rural Institute|Dindigul|Dindigul|Deemed University
Vel Tech Rangarajan Dr. Sagunthala R&D Institute of Science and Technology|Chennai|Tiruvallur|Deemed University
Vellore Institute of Technology (VIT)|Vellore|Vellore|Deemed University
Vels Institute of Science, Technology & Advanced Studies (VISTAS)|Chennai|Chennai|Deemed University
Vinayaka Mission's Research Foundation|Salem|Salem|Deemed University
Dhanalakshmi Srinivasan University|Tiruchirappalli|Tiruchirappalli|Private University
Shiv Nadar University Chennai|Kalavakkam|Chengalpattu|Private University
St. Joseph University|Tindivanam|Villupuram|Private University
Sri Venkateswaraa University|Thoothukudi|Thoothukudi|Private University
NMV University|Aruppukottai|Virudhunagar|Private University
Jeppiaar University|Chennai|Chennai|Private University
Sai University|Chennai|Chengalpattu|Private University
Takshashila University|Tindivanam|Villupuram|Private University
Joy University|Tirunelveli|Tirunelveli|Private University
Bharathidasan Institute of Management|Tiruchirappalli|Tiruchirappalli|Research Institute
Central Electrochemical Research Institute|Karaikudi|Sivaganga|Research Institute
Central Institute of Brackishwater Aquaculture|Chennai|Chennai|Research Institute
Central Leather Research Institute|Chennai|Chennai|Research Institute
Indian Institute of Handloom Technology|Salem|Salem|Research Institute
National Institute of Fashion Technology, Chennai|Chennai|Chennai|Research Institute
Sardar Vallabhbhai Patel International School of Textiles & Management|Coimbatore|Coimbatore|Research Institute
Institute of Mathematical Sciences|Chennai|Chennai|Research Institute
Madras Institute of Development Studies|Chennai|Chennai|Research Institute
Madras School of Economics|Chennai|Chennai|Research Institute
National Institute of Siddha|Chennai|Chennai|Research Institute
Agricultural College and Research Institute, Chettinad|Chettinad|Sivaganga|Agricultural College
Agricultural College and Research Institute, Coimbatore|Coimbatore|Coimbatore|Agricultural College
Agricultural College and Research Institute, Karur|Karur|Karur|Agricultural College
Agricultural College and Research Institute, Keezhvelur|Keezhvelur|Nagapattinam|Agricultural College
Agricultural College and Research Institute, Kudumiyanmalai|Kudumiyanmalai|Pudukkottai|Agricultural College
Agricultural College and Research Institute, Madurai|Madurai|Madurai|Agricultural College
Agricultural College and Research Institute, Vazhavachanur|Vazhavachanur|Tiruvannamalai|Agricultural College
Agricultural Engineering College and Research Institute, Coimbatore|Coimbatore|Coimbatore|Agricultural College
Agricultural Engineering College and Research Institute, Kumulur|Kumulur|Tiruchirappalli|Agricultural College
Anbil Dharmalingam Agricultural College and Research Institute|Tiruchirappalli|Tiruchirappalli|Agricultural College
Community Science College and Research Institute, Madurai|Madurai|Madurai|Agricultural College
Dr. M.S. Swaminathan Agricultural College and Research Institute, Eachangottai|Eachangottai|Thanjavur|Agricultural College
Forestry College and Research Institute, Mettupalayam|Mettupalayam|Coimbatore|Agricultural College
Horticultural College and Research Institute, Coimbatore|Coimbatore|Coimbatore|Agricultural College
Horticultural College and Research Institute, Paiyur|Paiyur|Krishnagiri|Agricultural College
Horticultural College and Research Institute, Periyakulam|Periyakulam|Theni|Agricultural College
Horticultural College and Research Institute for Women, Tiruchirappalli|Tiruchirappalli|Tiruchirappalli|Agricultural College
V.O. Chidambaranar Agricultural College and Research Institute, Killikulam|Killikulam|Thoothukudi|Agricultural College
College of Agricultural Technology, Theni|Kullapuram|Theni|Agricultural College
Madras Medical College|Chennai|Chennai|Medical College
Stanley Medical College|Chennai|Chennai|Medical College
Kilpauk Medical College|Chennai|Chennai|Medical College
Government Medical College, Omandurar Government Estate|Chennai|Chennai|Medical College
Government Chengalpattu Medical College|Chengalpattu|Chengalpattu|Medical College
Government Dharmapuri Medical College|Dharmapuri|Dharmapuri|Medical College
Madurai Medical College|Madurai|Madurai|Medical College
K.A.P. Viswanatham Government Medical College|Tiruchirappalli|Tiruchirappalli|Medical College
Thanjavur Medical College|Thanjavur|Thanjavur|Medical College
Government Mohan Kumaramangalam Medical College|Salem|Salem|Medical College
Government Thoothukudi Medical College|Thoothukudi|Thoothukudi|Medical College
Kanyakumari Government Medical College|Nagercoil|Kanyakumari|Medical College
Government Vellore Medical College|Vellore|Vellore|Medical College
Government Tiruvannamalai Medical College|Tiruvannamalai|Tiruvannamalai|Medical College
Government Karur Medical College|Karur|Karur|Medical College
Government Theni Medical College|Theni|Theni|Medical College
Coimbatore Medical College|Coimbatore|Coimbatore|Medical College
Tirunelveli Medical College|Tirunelveli|Tirunelveli|Medical College
Government Sivagangai Medical College|Sivaganga|Sivaganga|Medical College
Government Thiruvarur Medical College|Tiruvarur|Tiruvarur|Medical College
Government Villupuram Medical College|Villupuram|Villupuram|Medical College
Government Pudukkottai Medical College|Pudukkottai|Pudukkottai|Medical College
Government Dindigul Medical College|Dindigul|Dindigul|Medical College
Government Namakkal Medical College|Namakkal|Namakkal|Medical College
Government Ramanathapuram Medical College|Ramanathapuram|Ramanathapuram|Medical College
Government Virudhunagar Medical College|Virudhunagar|Virudhunagar|Medical College
Government Medical College, The Nilgiris|Udhagamandalam|The Nilgiris|Medical College
Government Tiruppur Medical College|Tiruppur|Tiruppur|Medical College
Government Krishnagiri Medical College|Krishnagiri|Krishnagiri|Medical College
Government Nagapattinam Medical College|Nagapattinam|Nagapattinam|Medical College
Government Thiruvallur Medical College|Tiruvallur|Tiruvallur|Medical College
Government Ariyalur Medical College|Ariyalur|Ariyalur|Medical College
Government Kallakurichi Medical College|Kallakurichi|Kallakurichi|Medical College
Government Erode Medical College|Perundurai|Erode|Medical College
Government Cuddalore Medical College|Chidambaram|Cuddalore|Medical College
College of Engineering, Guindy|Chennai|Chennai|Engineering College
Madras Institute of Technology|Chennai|Chengalpattu|Engineering College
Alagappa College of Technology|Chennai|Chennai|Engineering College
University College of Engineering, Kancheepuram|Kancheepuram|Kancheepuram|Engineering College
Government College of Technology, Coimbatore|Coimbatore|Coimbatore|Engineering College
Government College of Engineering, Salem|Salem|Salem|Engineering College
Government College of Engineering, Tirunelveli|Tirunelveli|Tirunelveli|Engineering College
Government College of Engineering, Erode (IRTT)|Erode|Erode|Engineering College
Alagappa Chettiar Government College of Engineering and Technology|Karaikudi|Sivaganga|Engineering College
Adithya Institute of Technology|Coimbatore|Coimbatore|Engineering College
Arunachala College of Engineering for Women|Nagercoil|Kanyakumari|Engineering College
Bannari Amman Institute of Technology|Sathyamangalam|Erode|Engineering College
Bhajarang Engineering College|Tiruvallur|Tiruvallur|Engineering College
Coimbatore Institute of Technology|Coimbatore|Coimbatore|Engineering College
Dr. Sivanthi Aditanar College of Engineering|Tiruchendur|Thoothukudi|Engineering College
Easwari Engineering College|Chennai|Chennai|Engineering College
Indra Ganesan College of Engineering|Tiruchirappalli|Tiruchirappalli|Engineering College
Jeppiaar Engineering College|Chennai|Chennai|Engineering College
Jerusalem College of Engineering|Chennai|Chennai|Engineering College
J.K.K. Nattraja College of Engineering and Technology|Komarapalayam|Namakkal|Engineering College
K.L.N. College of Engineering|Madurai|Sivaganga|Engineering College
Karpagam College of Engineering|Coimbatore|Coimbatore|Engineering College
Kongu Engineering College|Perundurai|Erode|Engineering College
KPR Institute of Engineering and Technology|Coimbatore|Coimbatore|Engineering College
Kumaraguru College of Technology|Coimbatore|Coimbatore|Engineering College
M. Kumarasamy College of Engineering|Karur|Karur|Engineering College
Mahendra Engineering College|Mallasamudram|Namakkal|Engineering College
Mailam Engineering College|Mailam|Villupuram|Engineering College
M.A.M. College of Engineering and Technology|Tiruchirappalli|Tiruchirappalli|Engineering College
Marthandam College of Engineering and Technology|Marthandam|Kanyakumari|Engineering College
Mepco Schlenk Engineering College|Sivakasi|Virudhunagar|Engineering College
Mount Zion College of Engineering and Technology|Pudukkottai|Pudukkottai|Engineering College
Paavai Engineering College|Namakkal|Namakkal|Engineering College
Parisutham Institute of Technology & Science|Thanjavur|Thanjavur|Engineering College
PSG College of Technology|Coimbatore|Coimbatore|Engineering College
Rajalakshmi Engineering College|Chennai|Kancheepuram|Engineering College
Rathinam Technical Campus|Coimbatore|Coimbatore|Engineering College
R.M.D. Engineering College|Kavaraipettai|Tiruvallur|Engineering College
R.M.K. Engineering College|Kavaraipettai|Tiruvallur|Engineering College
R.M.K. College of Engineering and Technology|Puduvoyal|Tiruvallur|Engineering College
S.A. Engineering College|Chennai|Tiruvallur|Engineering College
Sona College of Technology|Salem|Salem|Engineering College
Sri Krishna College of Engineering & Technology|Coimbatore|Coimbatore|Engineering College
Sri Ramakrishna Engineering College|Coimbatore|Coimbatore|Engineering College
Sri Sairam Engineering College|Chennai|Chengalpattu|Engineering College
Sri Venkateswara College of Engineering|Sriperumbudur|Kancheepuram|Engineering College
SSN College of Engineering|Kalavakkam|Chengalpattu|Engineering College
St. Joseph's College of Engineering|Chennai|Chennai|Engineering College
St. Peter's College of Engineering and Technology|Chennai|Tiruvallur|Engineering College
Thiagarajar College of Engineering|Madurai|Madurai|Engineering College
SRM Valliammai Engineering College|Kattankulathur|Chengalpattu|Engineering College
Velalar College of Engineering and Technology|Erode|Erode|Engineering College
Velammal College of Engineering and Technology|Madurai|Madurai|Engineering College
Velammal Engineering College|Chennai|Chennai|Engineering College
Vickram College of Engineering|Enathi|Sivaganga|Engineering College
Ayya Nadar Janaki Ammal College|Sivakasi|Virudhunagar|Arts & Science College
Ethiraj College for Women|Chennai|Chennai|Arts & Science College
Agurchand Manmull Jain College|Chennai|Chennai|Arts & Science College
Government Arts College, Karur|Karur|Karur|Arts & Science College
J.K.K. Nattraja College of Arts & Science|Komarapalayam|Namakkal|Arts & Science College
Kumaraguru College of Liberal Arts and Science|Coimbatore|Coimbatore|Arts & Science College
Loyola College|Chennai|Chennai|Arts & Science College
Madras Christian College|Chennai|Chengalpattu|Arts & Science College
Presidency College|Chennai|Chennai|Arts & Science College
PSG College of Arts and Science|Coimbatore|Coimbatore|Arts & Science College
Rathinam College of Arts and Science|Coimbatore|Coimbatore|Arts & Science College
Sacred Heart College, Tirupattur|Tirupattur|Tirupattur|Arts & Science College
Sri Parasakthi College for Women|Courtallam|Tenkasi|Arts & Science College
The New College|Chennai|Chennai|Arts & Science College
Thiruthangal Nadar College|Chennai|Chennai|Arts & Science College
Vidhyaa Giri College of Arts and Science|Karaikudi|Sivaganga|Arts & Science College
Women's Christian College|Chennai|Chennai|Arts & Science College
Bishop Heber College|Tiruchirappalli|Tiruchirappalli|Arts & Science College
Jamal Mohamed College|Tiruchirappalli|Tiruchirappalli|Arts & Science College
St. Joseph's College, Tiruchirappalli|Tiruchirappalli|Tiruchirappalli|Arts & Science College
National College, Tiruchirappalli|Tiruchirappalli|Tiruchirappalli|Arts & Science College
Holy Cross College, Tiruchirappalli|Tiruchirappalli|Tiruchirappalli|Arts & Science College
The American College|Madurai|Madurai|Arts & Science College
Lady Doak College|Madurai|Madurai|Arts & Science College
Stella Maris College|Chennai|Chennai|Arts & Science College
Queen Mary's College|Chennai|Chennai|Arts & Science College
Pachaiyappa's College|Chennai|Chennai|Arts & Science College
Government Arts College, Coimbatore|Coimbatore|Coimbatore|Arts & Science College
Nallamuthu Gounder Mahalingam College|Pollachi|Coimbatore|Arts & Science College
Scott Christian College|Nagercoil|Kanyakumari|Arts & Science College
St. Xavier's College, Palayamkottai|Palayamkottai|Tirunelveli|Arts & Science College
Erode Arts and Science College|Erode|Erode|Arts & Science College
Chikkaiah Naicker College|Erode|Erode|Arts & Science College
Kongu Arts and Science College|Erode|Erode|Arts & Science College
A.V.V.M. Sri Pushpam College|Poondi|Thanjavur|Arts & Science College
A.D.M. College for Women|Nagapattinam|Nagapattinam|Arts & Science College
Loyola Institute of Business Administration|Chennai|Chennai|Management Institute
Thiagarajar School of Management|Madurai|Madurai|Management Institute
KV Institute of Management and Information Studies|Coimbatore|Coimbatore|Management Institute
ICAT Design & Media College|Chennai|Chennai|Other College
HIMT College (Hindustan Institute of Maritime Training)|Chennai|Chennai|Other College
"""


_KIND = {"State University": "state", "Central University": "central", "Deemed University": "deemed",
         "Private University": "private", "National Institute": "national", "Research Institute": "national"}
KIND_LABELS = {"state": "State university", "central": "Central university", "deemed": "Deemed university",
               "private": "Private university", "national": "National / research institute", "college": "College"}


def _slug(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")[:60]


def _build() -> List[Dict[str, Any]]:
    out, seen = [], set()
    for line in RAW.strip().splitlines():
        name, city, district, kind = [p.strip() for p in line.split("|")]
        iid = _slug(name)
        if iid in seen:
            continue
        seen.add(iid)
        out.append({"id": iid, "name": name, "kind": _KIND.get(kind, "college"), "type": kind, "city": city,
                    "district": district, "state": STATE, "affiliation": ""})
    return sorted(out, key=lambda x: x["name"].lower())


INSTITUTIONS: List[Dict[str, Any]] = _build()
BY_ID: Dict[str, Dict[str, Any]] = {i["id"]: i for i in INSTITUTIONS}
OTHER_ID = "other"
_BY_NAME = {i["name"].lower(): i for i in INSTITUTIONS}


def all_institutions() -> List[Dict[str, Any]]:
    return [dict(i) for i in INSTITUTIONS]


def find(key: str):
    """Look up by id or exact name (case-insensitive). Returns None if unknown."""
    key = (key or "").strip()
    return BY_ID.get(key) or _BY_NAME.get(key.lower())


def geography() -> Dict[str, Dict[str, List[str]]]:
    """state -> district -> sorted cities."""
    geo: Dict[str, Dict[str, set]] = {}
    for i in INSTITUTIONS:
        geo.setdefault(i["state"], {}).setdefault(i["district"], set()).add(i["city"])
    return {st: {d: sorted(c) for d, c in sorted(ds.items())} for st, ds in geo.items()}
SOURCE_NOTE = ("Starter catalogue of Tamil Nadu universities and colleges (source: Wikipedia list of institutions of "
               "higher education in Tamil Nadu). Not every affiliated college is included - choose "
               "'My college is not listed' if yours is missing.")
