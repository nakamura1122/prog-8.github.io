# -*- coding: utf-8 -*-
"""VOICEVOXでナレーションを合成し、スライド動画に音声を組み込む"""
import subprocess

from voicevox_core.blocking import Onnxruntime, OpenJtalk, Synthesizer, VoiceModelFile

LINES = [
    "窓ガラスフィルムって、何がいいの？貼るだけで、窓がもっと快適になるんです。",
    "メリットいち。紫外線を約きゅうじゅうきゅうパーセントカット。家具の色あせや、日焼け対策に効果的です。",
    "メリットに。遮熱、断熱効果で、夏は涼しく、冬は暖かく。節電にもつながります。",
    "メリットさん。割れてもガラスが飛び散らず、防災や防犯にも安心です。",
    "目隠しタイプなら、プライバシー対策にも。用途に合わせて、選んでみましょう。",
]
STYLE_ID = 2  # 四国めたん ノーマル

ort = Onnxruntime.load_once(
    filename="vv/voicevox_onnxruntime-linux-x64-1.17.3/lib/libvoicevox_onnxruntime.so.1.17.3")
syn = Synthesizer(ort, OpenJtalk("/var/lib/mecab/dic/open-jtalk/naist-jdic"))
with VoiceModelFile.open("vv/vvms/0.vvm") as m:
    syn.load_voice_model(m)

durs = []
for i, line in enumerate(LINES, 1):
    q = syn.create_audio_query(line, STYLE_ID)
    q.speed_scale = 1.05
    q.post_phoneme_length = 0.15
    wav = syn.synthesis(q, STYLE_ID)
    path = f"tts/narr{i}.wav"
    with open(path, "wb") as f:
        f.write(wav)
    d = float(subprocess.check_output(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "default=nw=1:nk=1", path]).strip())
    durs.append(d)
    print(f"narr{i}: {d:.2f}s  {line}")

# --- タイミング計算 ---
XF = 0.6          # クロスフェード秒
LEAD = 0.5        # シーン開始からナレーション開始までの間
PAD = 1.0         # ナレーション終了からシーン終了までの余韻
MIN_SCENE = 4.5
scene_d = [max(LEAD + d + PAD, MIN_SCENE) for d in durs]
starts = []       # 各シーンの開始時刻(最終タイムライン上)
t = 0.0
for sd in scene_d:
    starts.append(t)
    t += sd - XF
total = t + XF    # 最後のシーンはフェードなしで終わるので調整
total = starts[-1] + scene_d[-1]
print("scene durations:", [f"{x:.2f}" for x in scene_d], "total:", f"{total:.2f}")

# --- ffmpeg組み立て ---
fc = []
for i, sd in enumerate(scene_d):
    frames = round(sd * 30)
    zexpr = (f"1+0.10*on/{frames - 1}" if i % 2 == 0
             else f"1.10-0.10*on/{frames - 1}")
    fc.append(
        f"[{i}]zoompan=z='{zexpr}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'"
        f":d={frames}:s=1080x1920:fps=30,format=yuv420p[v{i}]")
prev = "v0"
for k in range(4):
    out = f"x{k + 1}" if k < 3 else "vout"
    off = starts[k + 1]
    fc.append(f"[{prev}][v{k + 1}]xfade=transition=fade:duration={XF}:offset={off:.3f}[{out}]")
    prev = out
# BGM(控えめ) + ナレーション
fc.append(
    "[5]tremolo=f=0.4:d=0.35,lowpass=f=1100,"
    f"afade=t=in:d=2,afade=t=out:st={total - 3:.2f}:d=3,volume=0.30[bgm]")
for i in range(5):
    delay = round((starts[i] + LEAD) * 1000)
    fc.append(f"[{6 + i}]aresample=44100,adelay={delay}|{delay},volume=1.9[n{i}]")
fc.append("[bgm][n0][n1][n2][n3][n4]amix=inputs=6:duration=first:normalize=0[aout]")

cmd = ["ffmpeg", "-y"]
for i in range(1, 6):
    cmd += ["-i", f"slides/slide{i}.png"]
cmd += ["-f", "lavfi", "-t", f"{total:.2f}", "-i",
        "aevalsrc=0.16*sin(2*PI*220*t)+0.13*sin(2*PI*277.18*t)+0.13*sin(2*PI*329.63*t)"
        "+0.08*sin(2*PI*440*t)+0.05*sin(2*PI*554.37*t):s=44100"]
for i in range(1, 6):
    cmd += ["-i", f"tts/narr{i}.wav"]
cmd += ["-filter_complex", ";".join(fc), "-map", "[vout]", "-map", "[aout]",
        "-c:v", "libx264", "-preset", "medium", "-crf", "20",
        "-c:a", "aac", "-b:a", "160k", "-t", f"{total:.2f}",
        "window_film_short_narrated.mp4"]
subprocess.run(cmd, check=True, capture_output=True)
print("done:", total)
