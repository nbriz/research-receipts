/* global Base64, FileUploader */
const DATA = {}
let metadata
let ghtoken
let ghuser = window.location.toString().split('//')[1].split('.')[0]
if (ghuser.includes('localhost')) ghuser = 'nbriz'

function encodeURL (data) {
  const text = JSON.stringify(data)
  const b64 = Base64.encode(text)
  const uri = encodeURIComponent(b64)
  return `#data,${uri}`
}

// ----------------------------------------------------- DOM STUFF -------------

window.fu = new FileUploader({
  click: '#upload',
  drop: '#results',
  types: ['application/json'],
  dropping: (e) => { e.style.opacity = 0.5 },
  dropped: (e) => { e.style.opacity = 1 },
  ready: (file) => {
    let json
    try {
      const str = Base64.decode(file.data.split('json;base64,')[1])
      json = JSON.parse(str)
    } catch (err) {
      console.error(err)
      return window.alert('something\'s wrong with that JSON file. make sure it\'s a properly generated receipt.')
    }
    saveNewReceipt(file.name, json)
  },
  error: (err) => {
    console.error(err)
    window.alert('bad data. receipts should be a valid JSON file.')
  }
})

function addTags (list) {
  const tags = document.querySelector('#tags')
  list.forEach(tag => {
    tag = tag.toLowerCase().trim()
    const opt = document.createElement('option')
    opt.setAttribute('value', tag)
    opt.textContent = tag
    tags.appendChild(opt)
  })
}

function addResult (id, item) {
  const div = document.createElement('div')
  const hash = encodeURL(item)
  div.className = 'receipt'
  div.innerHTML = `
    <a href="${item.url}">
      <h1>${item.claim}</h1>
    </a>
    <hr>
    <p>
      <a class="delete" title="${id}">delete receipt</a>
      |
      <a href="https://nbriz.github.io/show-ur-receipts/${hash}">view receipt</a>
    </p>
  `
  div.querySelector('.delete').addEventListener('click', deleteReceipt)
  document.querySelector('#results').appendChild(div)
}

function setupTagFiltering () {
  document.querySelector('#tags').addEventListener('input', e => {
    const v = e.target.value
    if (v === 'tag') {
      document.querySelector('#results').innerHTML = ''
      for (const file in DATA) addResult(file, DATA[file])
    } else {
      const d = Object.keys(DATA)
        .map(i => ({ name: i, data: DATA[i] }))
        .filter(d => d.data.tags.map(t => t.toLowerCase()).includes(v))
      document.querySelector('#results').innerHTML = ''
      d.forEach(item => addResult(item.name, item.data))
    }
  })
}

function setupToken () {
  ghtoken = window.localStorage.getItem('ghtoken')
  const button = document.querySelector('#token')
  if (typeof ghtoken === 'string' && ghtoken.length > 0) {
    button.textContent = 'delete token'
  } else {
    button.textContent = 'add token'
  }
}

function tokenClick () {
  if (typeof ghtoken === 'string' && ghtoken.length > 0) {
    window.localStorage.removeItem('ghtoken')
    setupToken()
  } else {
    const token = window.prompt('enter your gh token')
    window.localStorage.setItem('ghtoken', token)
    setupToken()
  }
}

// ----------------------------------------------------- LOAD LOGIC ------------

async function loadData (name, data) {
  if (!data) {
    const res = await window.fetch(`receipts/${name}`)
    data = await res.json()
  }
  DATA[name] = data
  addResult(name, data)
  addTags(data.tags)
  document.querySelector('#tags').value = 'tag'
}

async function loadMetaData () {
  const res = await window.fetch('metadata.json')
  metadata = await res.json()
  const author = document.querySelector('#author')
  const title = document.querySelector('#title')
  author.textContent = metadata.author
  title.textContent = metadata.title
  metadata.receipts.forEach(async file => loadData(file))
}

// ----------------------------------------------------- SAVE TO GITHUB --------

async function saveMetadata () {
  const metadataString = JSON.stringify(metadata, null, 2)
  try {
    const data = { owner: ghuser, repo: 'research-receipts', path: 'metadata.json' }
    const { Octokit } = await import('https://cdn.skypack.dev/@octokit/core')
    const octokit = new Octokit({ auth: ghtoken })
    const req1 = await octokit.request('GET /repos/{owner}/{repo}/contents/{path}', data)
    data.sha = req1.data.sha
    data.message = 'updated metadata'
    data.content = Base64.encode(metadataString)
    const req2 = await octokit.request('PUT /repos/{owner}/{repo}/contents/{path}', data)
    console.log('metadata upated', req2)
  } catch (err) {
    window.alert('there was an issue updating your metadata (see console)')
    console.error(err)
  }
}

async function saveNewReceipt (name, json) {
  const data = Base64.encode(JSON.stringify(json))
  const { Octokit } = await import('https://cdn.skypack.dev/@octokit/core')
  const octokit = new Octokit({ auth: ghtoken })
  try {
    const req = await octokit.request('PUT /repos/{owner}/{repo}/contents/{path}', {
      owner: ghuser,
      repo: 'research-receipts',
      path: `receipts/${name}`,
      message: `added ${name}`,
      content: data
    })
    loadData(name, json)
    metadata.receipts.push(name)
    saveMetadata()
    console.log('receipt uplaoded', req)
  } catch (err) {
    window.alert('there was an issue uploading your receipt (see console)')
    console.error(err)
  }
}

async function deleteReceipt (e) {
  const filename = e.target.getAttribute('title')
  console.log(filename, DATA[filename])
  try {
    const data = { owner: ghuser, repo: 'research-receipts', path: `receipts/${filename}` }
    const { Octokit } = await import('https://cdn.skypack.dev/@octokit/core')
    const octokit = new Octokit({ auth: ghtoken })
    const req1 = await octokit.request('GET /repos/{owner}/{repo}/contents/{path}', data)
    data.sha = req1.data.sha
    data.message = `removed ${filename}`
    const req2 = await octokit.request('DELETE /repos/{owner}/{repo}/contents/{path}', data)
    // update metadata, DATA && DOM
    const idx = metadata.receipts.indexOf(filename)
    metadata.receipts.splice(idx, 1)
    saveMetadata()
    document.querySelector('#results').innerHTML = ''
    metadata.receipts.forEach(async file => loadData(file))
    console.log('receipt deleted', req2)
  } catch (err) {
    window.alert('there was an issue deleting your receipt (see console)')
    console.error(err)
  }
}

window.addEventListener('load', loadMetaData)
window.addEventListener('load', setupTagFiltering)
window.addEventListener('load', setupToken)
document.querySelector('#token').addEventListener('click', tokenClick)
