"""Offline jar-backed alpha/UV verification and original-art contact sheets.
uv run --with pillow python scripts/verify-equipment-ores.py CACHE_JARS OUTPUT
Calls the isolated Node exporter; never touches a live instance or vanilla RGB.
"""
import io
import json
from pathlib import Path
import re
import subprocess
import sys
import zipfile
from PIL import Image, ImageChops, ImageDraw

repo = Path(__file__).resolve().parents[1]
jars, out = Path(sys.argv[1]), Path(sys.argv[2])
versions = sorted((p.stem for p in jars.glob('*.jar') if re.fullmatch(r'\d+\.\d+(?:\.\d+)?', p.stem)), key=lambda v: tuple(map(int, v.split('.'))))
subprocess.run(['node.exe', str(repo/'scripts/preview-equipment-ores.js'), str(out), *versions], check=True, cwd=repo)
manifest = json.loads((out/'art-manifest.json').read_text())
checked, uv_pixels, per_version = 0, 0, {}
for version in versions:
    with zipfile.ZipFile(jars/(version+'.jar')) as z:
        expected = set()
        for path in z.namelist():
            rel = path.removeprefix('assets/minecraft/textures/')
            if path.startswith('assets/minecraft/textures/') and path.endswith('.png') and (rel.startswith('models/armor/') or rel.startswith('entity/equipment/humanoid') or rel in ('entity/elytra.png', 'entity/equipment/wings/elytra.png')):
                expected.add(rel)
        for style in ('fast', 'looks'):
            entries = [e for e in manifest['equipment'] if e['version'] == version and e['style'] == style]
            assert len(entries) == len(expected), (version, style, len(entries), len(expected))
            assert {e['texture'] for e in entries} == expected, (version, style, 'wrong equipment paths')
            for e in entries:
                original = Image.open(io.BytesIO(z.read('assets/minecraft/textures/'+e['texture']))).convert('RGBA')
                generated = Image.open(out/e['file']).convert('RGBA')
                scale = 2 if style == 'looks' else 1
                assert generated.size == (original.width*scale, original.height*scale)
                geometry = original.getchannel('A').resize(generated.size, Image.Resampling.NEAREST)
                assert ImageChops.difference(geometry, generated.getchannel('A')).getbbox() is None, (version, style, e['texture'], 'alpha / UV hole')
                checked += 1
                uv_pixels += generated.width*generated.height
        per_version[version] = len(expected)

BG=(27,31,36,255)
def text(draw, xy, label, color=(210,216,219)):
    draw.text(xy, label, fill=color)
def texture(style, category, material):
    p=out/'26.3'/style/'entity/equipment'/category/(material+'.png')
    return Image.open(p).convert('RGBA') if p.exists() else None

def tint(image, rgb):
    result=image.copy()
    for y in range(result.height):
        for x in range(result.width):
            r,g,b,a=result.getpixel((x,y))
            result.putpixel((x,y),(r*rgb[0]//255,g*rgb[1]//255,b*rgb[2]//255,a))
    return result

def worn(material,style,back=False,dye=(157,107,69)):
    k=2 if style=='looks' else 1
    body=texture(style,'humanoid',material)
    legs=texture(style,'humanoid_leggings',material)
    if material=='leather':
        body=tint(body,dye); body.alpha_composite(texture(style,'humanoid','leather_overlay'))
        legs=tint(legs,dye); legs.alpha_composite(texture(style,'humanoid_leggings','leather_overlay'))
    canvas=Image.new('RGBA',(16*k,32*k))
    draw=ImageDraw.Draw(canvas)
    # Neutral display mannequin, deliberately visible through chainmail/face.
    draw.rectangle((4*k,0,12*k-1,8*k-1),fill=(126,117,105,255))
    draw.rectangle((0,8*k,16*k-1,20*k-1),fill=(115,110,102,255))
    draw.rectangle((4*k,20*k,12*k-1,32*k-1),fill=(105,102,97,255))
    def part(sheet,box,xy):
        if sheet is not None: canvas.alpha_composite(sheet.crop(tuple(v*k for v in box)),(xy[0]*k,xy[1]*k))
    part(body,(24 if back else 8,8,32 if back else 16,16),(4,0))
    part(legs,(32 if back else 20,20,40 if back else 28,32),(4,8))
    part(body,(32 if back else 20,20,40 if back else 28,32),(4,8))
    arm=(52 if back else 44,20,56 if back else 48,32)
    part(body,arm,(0,8)); part(body,arm,(12,8))
    limb=(12 if back else 4,20,16 if back else 8,32)
    for x in (4,8):
        part(legs,limb,(x,20)); part(body,limb,(x,20))
    return canvas

materials=['leather','chainmail','iron','gold','copper','diamond','netherite','turtle_scute']
sheet=Image.new('RGBA',(len(materials)*138,380),BG); draw=ImageDraw.Draw(sheet)
text(draw,(12,8),'Original worn armour | UV-projected front/back mannequins (not game renders)')
for row,style in enumerate(('fast','looks')):
    y=34+row*171
    for col,m in enumerate(materials):
        x=col*138+8; text(draw,(x,y),m.replace('_scute','')+' / '+style)
        for side in (0,1):
            sample=worn(m,style,side==1)
            sample=sample.resize((56,112),Image.Resampling.NEAREST)
            sheet.alpha_composite(sample,(x+side*62,y+22))
sheet.convert('RGB').save(out/'worn-materials-contact.png')

# Explicit dye-behaviour swatches: overlay stays brown while the leather changes.
sheet=Image.new('RGBA',(640,180),BG); draw=ImageDraw.Draw(sheet)
text(draw,(12,8),'Leather dye multiplication; undyed straps / overlay are retained')
for col,(name,color) in enumerate([('default',(157,107,69)),('brick',(190,73,61)),('blue',(69,105,176)),('sage',(111,151,93))]):
    text(draw,(col*150+12,30),name)
    sheet.alpha_composite(worn('leather','looks',dye=color).resize((56,112),Image.Resampling.NEAREST),(col*150+35,52))
sheet.convert('RGB').save(out/'leather-dye-contact.png')

for style in ('fast','looks'):
    ores=[e for e in manifest['ores'] if e['style']==style]
    sheet=Image.new('RGB',(6*204,3*225),(27,31,36)); draw=ImageDraw.Draw(sheet)
    tile=Image.new('RGB',(6*272,3*294),(27,31,36)); td=ImageDraw.Draw(tile)
    for i,e in enumerate(ores):
        col,row=i%6,i//6; S=e['size']
        image=Image.open(out/e['file']).crop((0,0,S,S)).convert('RGB')
        x,y=col*204+6,row*225+6
        text(draw,(x,y),e['name'].replace('deepslate_','deep '))
        sheet.paste(image.resize((192,192),Image.Resampling.NEAREST),(x,y+20))
        x,y=col*272+6,row*294+6
        text(td,(x,y),e['name'].replace('deepslate_','deep '))
        small=image.resize((64,64),Image.Resampling.NEAREST)
        for yy in range(4):
            for xx in range(4): tile.paste(small,(x+xx*64,y+20+yy*64))
    sheet.save(out/f'ore-contact-{style}.png'); tile.save(out/f'ore-tiled-{style}.png')

# Every modern UV sheet, including baby and elytra, on a checkerboard.
entries=[e for e in manifest['equipment'] if e['version']=='26.3' and e['style']=='looks']
sheet=Image.new('RGB',(4*268,7*290),(27,31,36)); draw=ImageDraw.Draw(sheet)
for i,e in enumerate(entries):
    x,y=(i%4)*268+6,(i//4)*290+6
    text(draw,(x,y),e['texture'].replace('entity/equipment/','').replace('.png',''))
    im=Image.open(out/e['file']).convert('RGBA'); im=im.resize((256,im.height*256//im.width),Image.Resampling.NEAREST)
    checker=Image.new('RGBA',im.size)
    checker.putdata([(54,57,61,255) if (xx//8+yy//8)%2 else (66,69,73,255) for yy in range(im.height) for xx in range(im.width)])
    checker.alpha_composite(im); sheet.paste(checker.convert('RGB'),(x,y+22))
sheet.save(out/'equipment-uv-contact.png')
report={'versions':per_version,'verifiedEquipmentSheets':checked,'comparedAlphaPixels':uv_pixels,'alphaMismatches':0,'oreKinds':len(manifest['ores'])//2,'contactSheets':['worn-materials-contact.png','leather-dye-contact.png','ore-contact-fast.png','ore-contact-looks.png','ore-tiled-fast.png','ore-tiled-looks.png','equipment-uv-contact.png'],'notCovered':['horse armour','wolf armour','ancient debris redraw']}
(out/'verification-report.json').write_text(json.dumps(report,indent=2))
print(json.dumps(report,indent=2))
