import logging
from typing import Dict, Any

logger = logging.getLogger("tool_agent")

class AgentLoopGuard:
    def __init__(self, max_iterations: int = 5):
        self.max_iterations = max_iterations
        self.history = set()

    def check_loop(self, tool_name: str, tool_args: dict, current_step: int) -> None:
        if current_step > self.max_iterations:
            raise TimeoutError("Agent exceeded max reasoning iterations.")
        signature = f"{tool_name}:{sorted(tool_args.items())}"
        if signature in self.history:
            raise ValueError(f"Infinite loop detected on tool: {signature}")
        self.history.add(signature)