function updateFlags() {
const flags = {
alg: "🇩🇿",
arg: "🇦🇷",
aus: "🇦🇺",
aut: "🇦🇹",
bel: "🇧🇪",
bih: "🇧🇦",
bra: "🇧🇷",
can: "🇨🇦",
civ: "🇨🇮",
cod: "🇨🇩",
col: "🇨🇴",
cpv: "🇨🇻",
cro: "🇭🇷",
cuw: "🇨🇼",
cze: "🇨🇿",
ecu: "🇪🇨",
egy: "🇪🇬",
eng: "🏴",
esp: "🇪🇸",
fra: "🇫🇷",
ger: "🇩🇪",
gha: "🇬🇭",
hai: "🇭🇹",
irn: "🇮🇷",
irq: "🇮🇶",
jor: "🇯🇴",
jpn: "🇯🇵",
kor: "🇰🇷",
ksa: "🇸🇦",
mar: "🇲🇦",
mex: "🇲🇽",
ned: "🇳🇱",
nor: "🇳🇴",
nzl: "🇳🇿",
pan: "🇵🇦",
par: "🇵🇾",
por: "🇵🇹",
qat: "🇶🇦",
rsa: "🇿🇦",
sco: "🏴",
sen: "🇸🇳",
sui: "🇨🇭",
swe: "🇸🇪"
};

const batch = db.batch();

Object.entries(flags).forEach(([id, flag]) => {
const ref = db.collection("teams").doc(id);

```
batch.set(
  ref,
  {
    flag_icon: flag
  },
  { merge: true }
);
```

});

return batch.commit();
}
