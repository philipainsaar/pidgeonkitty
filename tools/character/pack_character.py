"""Pack the validated Alien Cat surface and Blender-authored SNOW360 motions.

Geometry, skinning and every corrective morph buffer are copied byte for byte.
Only image payloads are resized for delivery; motion channels are appended by
glTF node name, with explicit morph-name reordering and float32 verification.

Requires Pillow: python -m pip install Pillow
Usage: python tools/character/pack_character.py --source character.glb \
       --motions art/character/game_motion.json
"""
from __future__ import annotations

import argparse
from copy import deepcopy
from hashlib import sha256
from io import BytesIO
import json
import math
from pathlib import Path
import struct

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
COMPONENT = {5120: ('b', 1), 5121: ('B', 1), 5122: ('h', 2),
             5123: ('H', 2), 5125: ('I', 4), 5126: ('f', 4)}
WIDTH = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}


def load_glb(path):
    raw = Path(path).read_bytes()
    magic, version, total = struct.unpack_from('<4sII', raw)
    if (magic, version, total) != (b'glTF', 2, len(raw)):
        raise ValueError('Invalid GLB header')
    doc, binary, offset = None, None, 12
    while offset < len(raw):
        size, kind = struct.unpack_from('<II', raw, offset)
        payload = raw[offset+8:offset+8+size]
        if len(payload) != size:
            raise ValueError('Truncated GLB chunk')
        if kind == 0x4E4F534A:
            doc = json.loads(payload)
        elif kind == 0x004E4942:
            binary = payload
        offset += 8 + size
    if doc is None or binary is None:
        raise ValueError('GLB requires JSON and BIN chunks')
    if len(doc.get('buffers', [])) != 1:
        raise ValueError('Only self-contained GLBs are accepted')
    return doc, binary


def view_bytes(doc, binary, index):
    view = doc['bufferViews'][index]
    if view.get('buffer', 0) != 0:
        raise ValueError('External buffers are not supported')
    start = view.get('byteOffset', 0)
    data = binary[start:start+view['byteLength']]
    if len(data) != view['byteLength']:
        raise ValueError('Buffer view exceeds BIN chunk')
    return data


def read_accessor(doc, binary, index):
    acc = doc['accessors'][index]
    if 'sparse' in acc:
        raise ValueError('Sparse animation accessors are not supported')
    kind, size = COMPONENT[acc['componentType']]
    width = WIDTH[acc['type']]
    data = view_bytes(doc, binary, acc['bufferView'])
    stride = doc['bufferViews'][acc['bufferView']].get('byteStride', width*size)
    start = acc.get('byteOffset', 0)
    values = [list(struct.unpack_from('<'+kind*width, data, start+i*stride))
              for i in range(acc['count'])]
    if acc.get('normalized') and acc['componentType'] != 5126:
        signed = acc['componentType'] in (5120, 5122)
        maximum = (2 ** (size*8-1) - 1) if signed else (2 ** (size*8) - 1)
        values = [[max(-1., v/maximum) if signed else v/maximum for v in row] for row in values]
    return values


def audit_skin_weights(doc, binary):
    """Check actual per-vertex weights in the written file, across all sets."""
    rows = []
    for node in doc['nodes']:
        if 'mesh' not in node or 'skin' not in node:
            continue
        skin = doc['skins'][node['skin']]
        for primitive_index, primitive in enumerate(doc['meshes'][node['mesh']]['primitives']):
            attrs = primitive['attributes']
            sets = sorted(key.removeprefix('WEIGHTS_') for key in attrs if key.startswith('WEIGHTS_'))
            if not sets:
                raise ValueError('Skinned primitive has no weights: '+node['name'])
            weights = [read_accessor(doc, binary, attrs['WEIGHTS_'+s]) for s in sets]
            joints = [read_accessor(doc, binary, attrs['JOINTS_'+s]) for s in sets]
            count = doc['accessors'][attrs['POSITION']]['count']
            if any(len(a) != count for a in weights+joints):
                raise ValueError('Skin attribute count mismatch: '+node['name'])
            max_influences, sum_error, unweighted = 0, 0., 0
            for index in range(count):
                ws = [v for group in weights for v in group[index]]
                js = [v for group in joints for v in group[index]]
                if any(not math.isfinite(v) or v < 0 for v in ws):
                    raise ValueError('Invalid skin weight: '+node['name'])
                if any(not 0 <= j < len(skin['joints']) or int(j) != j for j in js):
                    raise ValueError('Invalid skin joint index: '+node['name'])
                active = sum(w > 1e-8 for w in ws)
                max_influences = max(max_influences, active)
                unweighted += active == 0
                sum_error = max(sum_error, abs(sum(ws)-1.))
            if unweighted or max_influences > 4 or sum_error > 1e-5:
                raise ValueError('Invalid web skin weights: '+node['name'])
            rows.append({'node': node['name'], 'primitive': primitive_index, 'vertices': count,
                         'maximum_influences': max_influences, 'unweighted_vertices': unweighted,
                         'maximum_weight_sum_error': sum_error, 'joints': len(skin['joints'])})
    if not rows:
        raise ValueError('No skinned primitives found')
    return {'status': 'PASS', 'maximum_influences': max(r['maximum_influences'] for r in rows),
            'unweighted_vertices': sum(r['unweighted_vertices'] for r in rows),
            'maximum_weight_sum_error': max(r['maximum_weight_sum_error'] for r in rows),
            'primitives': rows}


def texture_roles(doc):
    roles = {}
    def mark(info, role):
        if isinstance(info, dict) and 'index' in info:
            texture = doc['textures'][info['index']]
            if 'source' in texture:
                roles.setdefault(texture['source'], set()).add(role)
    for mat in doc.get('materials', []):
        pbr = mat.get('pbrMetallicRoughness', {})
        mark(pbr.get('baseColorTexture'), 'color')
        mark(pbr.get('metallicRoughnessTexture'), 'data')
        mark(mat.get('normalTexture'), 'normal')
        mark(mat.get('occlusionTexture'), 'data')
        mark(mat.get('emissiveTexture'), 'color')
        for extension in mat.get('extensions', {}).values():
            for key, value in extension.items():
                if key.endswith('Texture'):
                    mark(value, 'data' if any(s in key.lower() for s in ('roughness', 'normal', 'thickness')) else 'color')
    return roles


def optimize_image(payload, roles, limit, quality):
    image = Image.open(BytesIO(payload))
    original_size = image.size
    ratio = min(1., limit/max(image.size))
    if ratio < 1:
        image = image.resize(tuple(max(1, round(v*ratio)) for v in image.size), Image.Resampling.LANCZOS)
    transparent = 'A' in image.getbands() and image.getchannel('A').getextrema()[0] < 255
    mime = 'image/png'
    out = BytesIO()
    if roles == {'color'} and not transparent:
        image = image.convert('RGB')
        image.save(out, format='JPEG', quality=quality, subsampling=0, optimize=True)
        mime = 'image/jpeg'
    else:
        image = image.convert('RGBA' if transparent else 'RGB')
        image.save(out, format='PNG', optimize=True)
    result = out.getvalue()
    # Validate the actual saved bytes, including normal-map hemisphere safety.
    decoded = Image.open(BytesIO(result)).convert('RGB')
    min_z = decoded.getchannel('B').getextrema()[0] if 'normal' in roles else None
    if min_z is not None and min_z < 128:
        raise ValueError('Texture processing introduced a flipped tangent-space normal')
    return result, mime, {'source_size': list(original_size), 'size': list(image.size),
                          'roles': sorted(roles), 'source_bytes': len(payload),
                          'bytes': len(result), 'mime_type': mime,
                          'minimum_normal_blue': min_z}


def append_view(doc, binary, payload):
    binary.extend(b'\0'*(-len(binary) % 4))
    index = len(doc['bufferViews'])
    doc['bufferViews'].append({'buffer': 0, 'byteOffset': len(binary), 'byteLength': len(payload)})
    binary.extend(payload)
    return index


def append_floats(doc, binary, values, acc_type, name, cache=None):
    width = WIDTH[acc_type]
    if len(values) % width or any(not math.isfinite(v) for v in values):
        raise ValueError('Invalid numeric channel: '+name)
    data = struct.pack('<'+'f'*len(values), *values)
    cache_key = (acc_type, data)
    if cache is not None and cache_key in cache:
        return cache[cache_key], data
    view = append_view(doc, binary, data)
    acc = {'bufferView': view, 'componentType': 5126, 'count': len(values)//width,
           'type': acc_type, 'name': name}
    if acc_type == 'SCALAR':
        acc['min'], acc['max'] = [min(values)], [max(values)]
    index = len(doc['accessors'])
    doc['accessors'].append(acc)
    if cache is not None:
        cache[cache_key] = index
    return index, data


def flatten(values):
    return [float(v) for row in values for v in row] if values and isinstance(values[0], (list, tuple)) else [float(v) for v in values]


def merge_motions(doc, binary, motion):
    nodes = {}
    for i, node in enumerate(doc['nodes']):
        name = node.get('name')
        if name:
            if name in nodes:
                raise ValueError('Ambiguous node name: '+name)
            nodes[name] = i
    existing = {a['name']: a for a in doc.get('animations', [])}
    rest_checks = []
    for authored in motion.get('restNodes', []):
        name = authored.get('name')
        if name not in nodes:
            raise ValueError('Authored skeleton has a node absent from the surface: '+str(name))
        native = doc['nodes'][nodes[name]]
        errors = {}
        for prop, default in [('translation', [0,0,0]), ('rotation', [0,0,0,1]), ('scale', [1,1,1])]:
            left, right = authored.get(prop, default), native.get(prop, default)
            difference = max(abs(a-b) for a,b in zip(left,right))
            if prop == 'rotation':
                difference = min(difference, max(abs(a+b) for a,b in zip(left,right)))
            errors[prop] = difference
        if max(errors.values()) > 2e-5 or ('matrix' in authored) != ('matrix' in native):
            raise ValueError('Authored skeleton rest transform differs: '+name+' '+str(errors))
        rest_checks.append({'node':name, 'max_transform_difference':max(errors.values())})
    checks, names, accessor_cache = [], set(), {}
    for clip in motion['clips']:
        name = clip['name']
        if name in names:
            raise ValueError('Duplicate authored clip: '+name)
        names.add(name)
        animation = {'name': name, 'channels': [], 'samplers': [],
                     'extras': {key:clip[key] for key in ('loop','duration','description') if key in clip}}
        targets = set()
        for channel in clip['channels']:
            node_name, path = channel['node'], channel['path']
            if node_name not in nodes:
                raise ValueError('Unknown motion node: '+node_name)
            if path not in ('translation', 'rotation', 'scale', 'weights'):
                raise ValueError('Unsupported animation path: '+path)
            target = (node_name, path)
            if target in targets:
                raise ValueError('Duplicate animation target: '+str(target))
            targets.add(target)
            times = [float(t) for t in channel['times']]
            if not times or times[0] < 0 or any(b <= a for a,b in zip(times,times[1:])):
                raise ValueError('Non-monotonic channel times: '+str(target))
            interpolation = channel.get('interpolation', 'LINEAR')
            if interpolation not in ('LINEAR', 'STEP'):
                raise ValueError('Only evaluated LINEAR/STEP clips are accepted')
            values = channel['values']
            shape_names = None
            width = 4 if path == 'rotation' else 3
            if path == 'weights':
                node = doc['nodes'][nodes[node_name]]
                mesh = doc['meshes'][node['mesh']]
                shape_names = mesh.get('extras', {}).get('targetNames', [])
                authored = channel.get('shapeNames')
                if not authored or len(set(authored)) != len(authored) or set(authored) != set(shape_names):
                    raise ValueError('Corrective target set differs for '+node_name)
                width = len(shape_names)
                flat = flatten(values)
                if len(flat) != len(times)*width:
                    raise ValueError('Morph channel frame count differs')
                order = [authored.index(key) for key in shape_names]
                values = [flat[f*width+i] for f in range(len(times)) for i in order]
            else:
                values = flatten(values)
            if len(values) != len(times)*width:
                raise ValueError('Animation sample count differs: '+str(target))
            if path == 'rotation':
                norm_error = max(abs(math.sqrt(sum(v*v for v in values[f:f+4]))-1) for f in range(0,len(values),4))
                if norm_error > 1e-3:
                    raise ValueError('Non-unit authored rotation: '+str(target))
            inputs, input_bytes = append_floats(doc, binary, times, 'SCALAR', name+' / '+node_name+' / time', accessor_cache)
            acc_type = 'SCALAR' if path == 'weights' else ('VEC4' if path == 'rotation' else 'VEC3')
            outputs, output_bytes = append_floats(doc, binary, values, acc_type, name+' / '+node_name+' / '+path, accessor_cache)
            sampler = len(animation['samplers'])
            animation['samplers'].append({'input': inputs, 'output': outputs, 'interpolation': interpolation})
            animation['channels'].append({'sampler': sampler, 'target': {'node': nodes[node_name], 'path': path}})
            checks.append({'clip': name, 'node': node_name, 'path': path, 'samples': len(times),
                           'components': width, 'input_accessor': inputs, 'output_accessor': outputs,
                           'input_sha256': sha256(input_bytes).hexdigest(),
                           'output_sha256': sha256(output_bytes).hexdigest(), 'shape_names': shape_names})
        existing[name] = animation
    doc['animations'] = list(existing.values())
    return checks, rest_checks


def write_glb(path, doc, binary):
    doc['buffers'] = [{'byteLength': len(binary)}]
    text = json.dumps(doc, separators=(',', ':'), ensure_ascii=False).encode('utf-8')
    text += b' '*(-len(text) % 4)
    binary += b'\0'*(-len(binary) % 4)
    raw = struct.pack('<4sII', b'glTF', 2, 12+8+len(text)+8+len(binary))
    raw += struct.pack('<II', len(text), 0x4E4F534A)+text
    raw += struct.pack('<II', len(binary), 0x004E4942)+binary
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(raw)


def package(source, motions, destination, limit, quality, budget):
    original, source_binary = load_glb(source)
    doc = deepcopy(original)
    binary = bytearray()
    roles = texture_roles(doc)
    image_views, image_report = {}, []
    for index, image in enumerate(doc.get('images', [])):
        if 'bufferView' not in image:
            raise ValueError('External image URI in source')
        image_views[image['bufferView']] = index
    preserved = []
    for index, view in enumerate(doc['bufferViews']):
        payload = view_bytes(original, source_binary, index)
        if index in image_views:
            image_index = image_views[index]
            payload, mime, row = optimize_image(payload, roles.get(image_index, {'data'}), limit, quality)
            image = doc['images'][image_index]
            image['mimeType'] = mime
            row.update(index=image_index, name=image.get('name'))
            image_report.append(row)
        else:
            preserved.append({'buffer_view': index, 'sha256': sha256(payload).hexdigest()})
        binary.extend(b'\0'*(-len(binary) % 4))
        view['byteOffset'], view['byteLength'] = len(binary), len(payload)
        binary.extend(payload)
    source_nodes, source_meshes, source_skins = deepcopy(doc['nodes']), deepcopy(doc['meshes']), deepcopy(doc['skins'])
    checks, rest_checks = merge_motions(doc, binary, motions)
    if (doc['nodes'], doc['meshes'], doc['skins']) != (source_nodes, source_meshes, source_skins):
        raise ValueError('Motion packing changed geometry or skin declarations')
    doc.setdefault('asset', {}).setdefault('extras', {})['snow360'] = {
        'source_sha256': sha256(Path(source).read_bytes()).hexdigest(),
        'texture_max_dimension': limit, 'geometry_and_morphs': 'Original V13 buffers preserved byte for byte',
        'game_clips': [clip['name'] for clip in motions['clips']], 'strands': False}
    write_glb(destination, doc, binary)
    packed, packed_binary = load_glb(destination)
    for row in preserved:
        if sha256(view_bytes(packed, packed_binary, row['buffer_view'])).hexdigest() != row['sha256']:
            raise ValueError('Original non-image buffer changed')
    for row in checks:
        for key in ('input','output'):
            acc = packed['accessors'][row[key+'_accessor']]
            payload = view_bytes(packed, packed_binary, acc['bufferView'])
            if sha256(payload).hexdigest() != row[key+'_sha256']:
                raise ValueError('Animation values changed on disk: '+row['clip'])
    triangles = sum(packed['accessors'][p['indices']]['count']//3 for m in packed['meshes'] for p in m['primitives'])
    morphs = {n['name']: packed['meshes'][n['mesh']].get('extras', {}).get('targetNames', [])
              for n in packed['nodes'] if 'mesh' in n}
    report = {'status':'PASS','file':str(destination.relative_to(ROOT)),
              'bytes':destination.stat().st_size,'budget_bytes':budget,'within_size_budget':destination.stat().st_size<=budget,
              'sha256':sha256(destination.read_bytes()).hexdigest(),'triangles':triangles,
              'skins':len(packed['skins']),'skin_joints':len(packed['skins'][0]['joints']),
              'skin_weight_validation':audit_skin_weights(packed, packed_binary),
              'source_non_image_buffers_verified':len(preserved),'source_geometry_morph_skin_declarations_preserved':True,
              'all_original_animations_retained':all(any(a['name']==s['name'] for a in packed['animations']) for s in original['animations']),
              'clips':[a['name'] for a in packed['animations']], 'game_clips':[c['name'] for c in motions['clips']],
              'morphs':morphs,'images':image_report,'authored_animation_channels_verified':len(checks),
              'authored_animation_scalar_values_verified':sum(r['samples']*(r['components']+1) for r in checks),
              'animation_channel_checks':checks,'strands_exported':False}
    report['skeleton_rest_checks'] = rest_checks
    if not report['within_size_budget']:
        raise ValueError(f'{destination.name} exceeds delivery budget: {report["bytes"]}')
    return report


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--source',type=Path,required=True)
    parser.add_argument('--motions',type=Path,default=ROOT/'art/character/game_motion.json')
    parser.add_argument('--output',type=Path,default=ROOT/'public/models')
    args=parser.parse_args()
    args.source=args.source.resolve();args.motions=args.motions.resolve();args.output=args.output.resolve()
    motions=json.loads(args.motions.read_text(encoding='utf-8-sig'))
    variants=[]
    for filename,limit,quality,budget in [('alien-cat-snow360.glb',2048,92,15_000_000),('alien-cat-snow360-mobile.glb',1024,88,10_000_000)]:
        variants.append(package(args.source,motions,args.output/filename,limit,quality,budget))
        print(filename,variants[-1]['bytes'],'bytes',len(variants[-1]['game_clips']),'game clips',flush=True)
    report={'status':'PASS','source':str(args.source),'motion_source':str(args.motions.relative_to(ROOT)),
            'motion_sha256':sha256(args.motions.read_bytes()).hexdigest(),'variants':variants}
    out=ROOT/'art/character/packing_validation.json';out.parent.mkdir(parents=True,exist_ok=True);out.write_text(json.dumps(report,indent=2))
    print('SNOW360_CHARACTER_PACKED',str(out),flush=True)


if __name__=='__main__':main()
