import json, pathlib
ROOT = pathlib.Path(__file__).resolve().parents[2]

def test_config_matches_published_folders():
    cfg = json.loads((ROOT / "config.json").read_text())
    folders = {v["folder"] for v in cfg["thresholds"].values()}
    assert folders == {"thr-05", "thr-10", "thr-15", "thr-15_5clusters", "thr-20"}
    assert cfg["thresholds"][cfg["defaultThreshold"]]["folder"] == "thr-15"
    for v in cfg["thresholds"].values():
        assert (ROOT / cfg["dataBase"] / v["folder"] / "matrix.csv").exists()
        assert isinstance(v["value"], float)
