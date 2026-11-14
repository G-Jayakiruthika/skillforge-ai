"""
graph.py - wires the agents into a state machine.

Uses LangGraph when it is installed. If it isn't (or fails to import), a tiny
built-in runner executes exactly the same nodes and edges, so the project
still runs on a machine where only FastAPI is installed.

    START -> supervisor --(event type)--> profiler | assessor | skill_analyst | path_architect
    assessor -> profiler -> skill_analyst -> career_matcher -> path_architect
             -> resource_curator -> mentor -> END
"""
from __future__ import annotations

from typing import Any, Callable, Dict, List, TypedDict

from . import agents

NODES: Dict[str, Callable[[Dict[str, Any]], Dict[str, Any]]] = {
    "supervisor": agents.supervisor_agent,
    "assessor": agents.assessor_agent,
    "profiler": agents.profiler_agent,
    "skill_analyst": agents.skill_analyst_agent,
    "career_matcher": agents.career_matcher_agent,
    "path_architect": agents.path_architect_agent,
    "resource_curator": agents.resource_curator_agent,
    "mentor": agents.mentor_agent,
}
EDGES = [
    ("assessor", "profiler"),
    ("profiler", "skill_analyst"),
    ("skill_analyst", "career_matcher"),
    ("career_matcher", "path_architect"),
    ("path_architect", "resource_curator"),
    ("resource_curator", "mentor"),
]
ENTRY_TARGETS = ["profiler", "assessor", "skill_analyst", "path_architect"]


class GraphState(TypedDict, total=False):
    learner: Dict[str, Any]
    event: Dict[str, Any]
    trace: List[Dict[str, str]]


ENGINE = "built-in state machine"
_compiled = None
try:
    from langgraph.graph import END, START, StateGraph  # type: ignore

    _b = StateGraph(GraphState)
    for _name, _fn in NODES.items():
        _b.add_node(_name, _fn)
    _b.add_edge(START, "supervisor")
    _b.add_conditional_edges("supervisor", agents.route_from_supervisor, {t: t for t in ENTRY_TARGETS})
    for _a, _z in EDGES:
        _b.add_edge(_a, _z)
    _b.add_edge("mentor", END)
    _compiled = _b.compile()
    ENGINE = "LangGraph"
except Exception:  # pragma: no cover - depends on environment
    _compiled = None


def _run_builtin(state: Dict[str, Any]) -> Dict[str, Any]:
    nxt = dict(EDGES)
    node = "supervisor"
    while node:
        state = {**state, **NODES[node](state)}
        node = agents.route_from_supervisor(state) if node == "supervisor" else nxt.get(node)
    return state


def run(learner: Dict[str, Any], event: Dict[str, Any]) -> Dict[str, Any]:
    """Run one event through the agent mesh. Returns {learner, event, trace}."""
    state: Dict[str, Any] = {"learner": learner, "event": event, "trace": []}
    if _compiled is not None:
        return dict(_compiled.invoke(state))
    return _run_builtin(state)


def describe() -> Dict[str, Any]:
    return {"engine": ENGINE, "nodes": list(NODES), "edges": EDGES,
            "routes": agents.ROUTES}
