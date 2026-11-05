// The menu order mirrors each hidden unit's parameter block in network::evaluate.
function buildNetworkDiagram(svg, hamiltonian, selectParameter) {
  const ns = 'http://www.w3.org/2000/svg';
  function element(parent, tag, attrs = {}, text) {
    const child = document.createElementNS(ns, tag);
    for (const [name, value] of Object.entries(attrs)) child.setAttribute(name, value);
    if (text !== undefined) child.textContent = text;
    parent.append(child);
    return child;
  }

  svg.replaceChildren();
  const wires = element(svg, 'g');
  const markers = element(svg, 'g');
  const nodes = element(svg, 'g');
  const parameters = [];
  const endpoints = [];
  function node(name, x, y, width, hidden = false) {
    const group = element(nodes, 'g', {class: 'net-node', transform: `translate(${x} ${y})`});
    element(group, 'rect', {class: 'node-body', x: -width/2, y: -13, width, height: 26, rx: hidden ? 13 : 6});
    element(group, 'text', {class: 'node-label', y: 1}, name);
    const ends = ['x','y'].map((axis, i) => element(group, 'line', {
      class: 'node-end', 'data-coordinate': axis, x1: -9 + 11*i, x2: -2 + 11*i, y1: 17, y2: 17
    }));
    const result = {name, x, y, width, group, ends};
    endpoints.push(result);
    return result;
  }

  function register(label, button, source, target, wire) {
    const index = parameters.length;
    button.setAttribute('role', 'button');
    button.setAttribute('tabindex', '0');
    button.setAttribute('data-parameter', index);
    const tooltip = element(button, 'title', {}, label);
    const badge = element(button, 'text', {class: 'axis-letter', 'aria-hidden': 'true'});
    const delta = element(button, 'text', {class: 'parameter-delta', 'aria-hidden': 'true'});
    parameters.push({label, button, source, target, wire, badge, tooltip, delta});
    return badge;
  }

  function bias(target, label) {
    const button = target.group;
    button.classList.add('bias-button');
    const x = target.width/2 - 1;
    element(button, 'circle', {class: 'bias-disc', cx: x, cy: -11, r: 7});
    const badge = register(label, button, null, target, null);
    badge.setAttribute('x', x);
    badge.setAttribute('y', -10);
  }

  function weight(source, target, label, hx, hy) {
    const x1 = source.x + source.width/2, x2 = target.x - target.width/2;
    const d = `M ${x1} ${source.y} C ${x1+24} ${source.y}, ${hx-18} ${hy}, ${hx} ${hy} S ${x2-20} ${target.y}, ${x2} ${target.y}`;
    const wire = element(wires, 'g', {'data-parameter': parameters.length, 'aria-hidden': 'true'});
    element(wire, 'path', {class: 'wire-ink', d});
    element(wire, 'path', {class: 'wire-hit', d});
    element(wire, 'title', {}, label);
    const handle = element(markers, 'g', {class: 'weight-button', transform: `translate(${hx} ${hy})`});
    element(handle, 'circle', {class: 'weight-hit', r: 12});
    element(handle, 'circle', {class: 'weight-disc', r: 3.3});
    const badge = register(label, handle, source, target, wire);
    badge.setAttribute('y', 1);
  }

  const inputNames = hamiltonian ? ['position','momentum'] : ['RPM','air torque','load'];
  for (const [x,label] of [[38,'Inputs'],[219,hamiltonian ? 'Hidden · z²' : 'Hidden · tanh'],[349,'Output']]) {
    element(svg, 'text', {class: 'layer-label', x, y: 15}, label);
  }
  const inputs = inputNames.map((name,i) => node(name[0].toUpperCase()+name.slice(1),
    38, 125 + (i-(inputNames.length-1)/2)*62, 66));
  const output = node(hamiltonian ? 'H(q, p)' : 'RPM/s', 349, 125, 62);
  for (let h = 0; h < 4; h++) {
    const unit = node('H'+(h+1), 219, 50+h*50, 34, true);
    inputs.forEach((input,i) => {
      const lane = i-(inputs.length-1)/2;
      weight(input, unit, unit.name+' · '+inputNames[i]+' weight', 140+26*lane, unit.y+10*lane);
    });
    bias(unit, unit.name+' · hidden bias');
    weight(unit, output, unit.name+' · output weight', 272, unit.y+(output.y-unit.y)*0.22);
  }
  bias(output, 'Output bias');

  function targetIndex(event) {
    return event.target.closest('[data-parameter]')?.getAttribute('data-parameter');
  }
  svg.onclick = event => {
    const index = targetIndex(event);
    if (index != null) selectParameter(Number(index));
  };
  svg.onkeydown = event => {
    const index = targetIndex(event);
    if (index != null && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault();
      selectParameter(Number(index));
    }
  };

  function update(x, y, activeAxis, offsets, trainedValue) {
    for (const [i, p] of parameters.entries()) {
      const axis = i === x ? 'x' : i === y ? 'y' : '';
      p.button.dataset.axis = axis;
      p.button.setAttribute('aria-pressed', String(axis === activeAxis));
      const offset = axis ? offsets[axis] : 0;
      const deltaText = offset ? (offset > 0 ? '+' : '')+offset.toFixed(2) : '';
      p.delta.textContent = deltaText;
      p.delta.setAttribute('y', p.wire ? (axis === 'x' ? -12 : 19) : -23);
      const label = p.label + (axis ? ', '+axis.toUpperCase()+' coordinate' : '')
        + (deltaText ? ', offset '+deltaText : '');
      p.button.setAttribute('aria-label', label);
      const trained = trainedValue(i);
      p.tooltip.textContent = label+' · trained '+trained.toFixed(3)
        + (offset ? ', edited '+(trained+offset).toFixed(3) : '');
      p.badge.textContent = axis.toUpperCase();
      if (p.wire) p.wire.dataset.axis = axis;
    }
    for (const index of [x,y]) {
      const wire = parameters[index].wire;
      if (wire) wires.append(wire); // Keep the two selected connections visible at crossings.
    }
    for (const endpoint of endpoints) {
      [x,y].forEach((index, i) => {
        const p = parameters[index];
        endpoint.ends[i].classList.toggle('connected', p.source === endpoint || p.target === endpoint);
      });
    }
  }
  return {labels: parameters.map(p => p.label), update};
}
