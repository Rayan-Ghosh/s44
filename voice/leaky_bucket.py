"""Leaky Bucket accumulator for streaming voice risk scoring."""

import time


class LeakyBucketAccumulator:
    def __init__(self, capacity: float = 1.0, leak_rate: float = 0.02) -> None:
        self.capacity = capacity
        self.leak_rate = leak_rate
        self.current_level = 0.0
        self.last_update = time.time()

    def add_risk(self, risk_delta: float) -> float:
        now = time.time()
        elapsed = now - self.last_update
        self.last_update = now

        # Leak
        self.current_level = max(0.0, self.current_level - (elapsed * self.leak_rate))

        # Add new risk
        self.current_level = min(self.capacity, self.current_level + risk_delta)
        return self.current_level

    def reset(self) -> None:
        self.current_level = 0.0
        self.last_update = time.time()
