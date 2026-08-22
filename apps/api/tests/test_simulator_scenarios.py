def test_list_simulator_scenarios(client):
    res = client.get("/api/v1/simulator/scenarios")
    assert res.status_code == 200
    scenarios = res.json()
    assert len(scenarios) == 7
    ids = [s["id"] for s in scenarios]
    assert "scenario_a" in ids
    assert "scenario_b" in ids
    assert "scenario_e" in ids
    assert "scenario_f" in ids


def test_execute_scenario_a_routine(client):
    res = client.post("/api/v1/simulator/scenarios/scenario_a/execute")
    assert res.status_code == 200
    body = res.json()
    assert body["scenario_id"] == "scenario_a"
    assert body["risk_level"] in ["LOW", "MEDIUM"]
    assert body["held_for_guardian"] is False


def test_execute_scenario_b_sudden_spike(client):
    res = client.post("/api/v1/simulator/scenarios/scenario_b/execute")
    assert res.status_code == 200
    body = res.json()
    assert body["scenario_id"] == "scenario_b"
    assert body["risk_level"] == "HIGH"
    assert body["held_for_guardian"] is True
    assert body["guardian_request_id"] is not None


def test_execute_scenario_e_voice_coercion(client):
    res = client.post("/api/v1/simulator/scenarios/scenario_e/execute")
    assert res.status_code == 200
    body = res.json()
    assert body["scenario_id"] == "scenario_e"
    assert body["risk_level"] == "HIGH"
    assert body["held_for_guardian"] is True
