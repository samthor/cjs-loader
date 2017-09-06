import {config} from '../cjs-faker.js';

/**
 * @param {string} id to convert to URL
 * @return {URL} null if unresolvable
 */
function idToURL(id) {
  try {
    return new URL(id);  // absolute
  } catch (e) {
    // ok
  }
  if (id.startsWith('./')) {
    return new URL(id, window.location);
  }
  return null;  // magic URL
}

async function loader(id) {
  const url = idToURL(id);
  if (!url) {
    throw new Error('TODO node_modules magic foo: ' + id);
  }

  // TODO: x-origin/credentials stuff
  // FIXME: path to cjs-faker??
  // FIXME: escape url, id
  const script = document.createElement('script');
  script.type = 'module';
  script.textContent = `
import faker from '../cjs-faker.js';
import '${url}';
faker('${id}'});
  `;
  document.head.appendChild(script);
  script.remove();

  return out;
}

config({loader});
