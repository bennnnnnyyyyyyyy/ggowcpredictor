import pandas as pd
from datetime import datetime

path = "ggowcpredictor db .xlsx"
pred = pd.read_excel(path, sheet_name="predictions")
res = pd.read_excel(path, sheet_name="results")
fix = pd.read_excel(path, sheet_name="fixtures")

df = (
    pred.merge(res[["matchId", "score1", "score2"]], on="matchId", how="inner")
        .merge(fix[["matchId", "kickoffUTC"]], on="matchId", how="left")
)

cutoff = pd.Timestamp("2026-06-18T16:00:00Z")

def to_int(x):
    return None if pd.isna(x) else int(x)

df["pred1"] = df["pred1"].map(to_int)
df["pred2"] = df["pred2"].map(to_int)
df["score1"] = df["score1"].map(to_int)
df["score2"] = df["score2"].map(to_int)
df["kickoffUTC"] = pd.to_datetime(df["kickoffUTC"], utc=True, errors="coerce")

df["pred_outcome"] = (df["pred1"] > df["pred2"]).astype(int) - (df["pred1"] < df["pred2"]).astype(int)
df["actual_outcome"] = (df["score1"] > df["score2"]).astype(int) - (df["score1"] < df["score2"]).astype(int)

wrong_3pt = df[
    (df["pred1"].notna()) &
    (df["pred2"].notna()) &
    (df["score1"].notna()) &
    (df["score2"].notna()) &
    (df["pred_outcome"] != df["actual_outcome"]) &
    (df["kickoffUTC"] < cutoff)
]

print(len(wrong_3pt))
print(wrong_3pt[["username", "matchId", "pred1", "pred2", "score1", "score2", "kickoffUTC"]]
      .sort_values(["kickoffUTC", "username", "matchId"]))