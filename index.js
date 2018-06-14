const path = require('path')
const ProductionLine = require('productionline')
const Parser = require('cherow')
const JSCommentParser = require('comment-parser')
const traverse = require('traverse')
const EE = require('events').EventEmitter

global.BUS = new EE() // global event bus

// See the global doc variable before including classes.
// This separation allows classes to use the DOC variable
// within the code.
global.DOC = {
  traverse
}

// Assign classes in a globally accessible manner.
global.DOC = Object.assign(DOC, {
  Class: require('./lib/class'),
  Exception: require('./lib/NGNException'),
  Event: require('./lib/Event'),
  Method: require('./lib/Method'),
  Parameter: require('./lib/Parameter'),
  RawSnippet: require('./lib/Snippet')
})

const NgnClass = require('./lib/Class')

class Generator extends ProductionLine {
  constructor (cfg = {}) {
    // Remove assets (since there aren't any)
    cfg.assets = []

    // Override standard source
    cfg.source = path.resolve('./src')

    super(cfg)

    this.DATA = {
      globals: [],
      classes: new Map(),
      exceptions: new Map(),
      requires: {},
      bus: new Map() // NGN.BUS events
    }

    this.STANDARD_OPTIONS = {
      loc: true,
      ranges: true,
      skipShebang: true,
      next: true,
      jsx: false,
      module: true,
      attachComment: true
      // tolerant: true
    }

    this.on('global.variable', name => {
      if (this.DATA.globals.indexOf(name) < 0) {
        this.DATA.globals.push(name)
      }
    })

    this.on('register.class', snippet => {
      console.log('Heard class')
      this.DATA.classes.set(snippet.label, snippet)
    })

    this.on('warning', msg => this.warn(msg))

    // Recognize global events on the NGN.BUS
    BUS.on('register.event', evt => {
      this.DATA.bus.set(evt.label, evt)
    })

    class LocalFile extends this.File {
      constructor () {
        super(...arguments)

        // Parse comments
        this.comments = require('./comment-extractor')(this.content)

        this.comments = this.comments.map((comment, cIndex) => {
          let lines = this.getLineByIndex(comment.range[0], comment.range[1])
          let parsedComment = JSCommentParser(comment.comment)

          comment = Object.assign(parsedComment.length > 0 ? parsedComment[0] : {}, {
            type: comment.comment.indexOf('\n') > 0 ? 'block' : 'single',
            raw: comment.comment,
            description: comment.comment.replace(/^^\/+\s?|\s?\*+\/|\/\*+|\s?\*\s?|@.+/g, '').trim(),
            range: comment.range,
            start: {
              line: lines[comment.range[0]]
            },
            end: {
              line: lines[comment.range[1]]
            },
            relativeLine: lines[comment.range[1]],
            inline: comment.comment.indexOf('\n') < 0 ? this.isCommentInline(lines[comment.range[0]], comment.range) : false
          })

          // Find related line
          for (let i = comment.end.line + (comment.inline ? 0 : 1); i < this.lineCount; i++) {
            // Skip blank lines
            if (this.lines[i].trim().length > 0) {
              // Skip comments
              for (let c = cIndex; c < this.comments.length; c++) {
                let cmt = this.getLineByIndex(this.comments[c].range[0], this.comments[c].range[1])

                if (this.isCommentInline(i, this.comments[c].range)) {
                  break
                }

                if (cmt[this.comments[c].range[0]] === i) {
                  i = cmt[this.comments[c].range[1]] + 1

                  while (i < this.lineCount && this.lines[i].trim().length === 0) {
                    i++
                  }

                  break
                }
              }

              if (i < this.lineCount) {
                comment.relativeLine = i
                break
              }
            }
          }

          comment.relativeLine = {
            line: comment.relativeLine,
            content: this.lines[comment.relativeLine]
          }

          return comment
        })
      }

      isCommentInline (line, commentRange) {
        let lineIndex = this.getLineIndexRange(line)[line]

        return commentRange[0] > lineIndex[0] && commentRange[1] <= lineIndex[1]
      }
    }

    this.LocalFile = LocalFile
  }

  get data () {
    return {
      globals: this.DATA.globals,
      classes: this.expand(this.DATA.classes),
      exceptions: this.DATA.exceptions,
      requires: this.DATA.requires,
      bus: DOC.Class.prototype.mapToObject(this.DATA.bus)
    }
  }

  expand (map) {
    let data = {}

    map.forEach((value, key) => {
      data[key] = value instanceof DOC.RawSnippet ? value.data : value
    })

    return data
  }

  before () {
    this.ignoreFile(path.join(this.source, '../..', '.buildignore'))
    this.ignoreFile(path.join(this.source, '../..', '.gitignore'))
  }

  parseFile (file, processorFn) {
    let sourcefile = new this.LocalFile(file)
    let ast = Parser.parse(sourcefile.content, this.STANDARD_OPTIONS)

    const me = this
    traverse(ast).forEach(function () {
      if (this.isLeaf) {
        if (this.key === 'type') {
          switch (this.node.toLowerCase()) {
            case 'classdeclaration':
              let Class = new NgnClass(this.parent.node, sourcefile)

              Class.on('warning', msg => me.emit('warning', msg))

              me.emit('register.class', Class)

              break
          }
        }
      }
      // if (Array.isArray(node)) {
      //
      // } else if (node.hasOwnProperty('type')) {
      //   switch (node.type.toLowerCase()) {
      //     case 'classdeclaration':
      //       let Class = new NgnClass(node, sourcefile)
      //       Class.on('warning', msg => this.emit('warning', msg))
      //
      //       this.emit('class', Class)
      //
      //       break
      //   }
      // }
    })
    // if (!this.FILES.hasOwnProperty(file)) {
    //   let source = new this.File(file)
    //   let options = {
    //     loc: true,
    //     ranges: true,
    //     skipShebang: true,
    //     next: true,
    //     jsx: false
    //     // tolerant: true
    //   }
    //
    //   if (typeof processorFn === 'function') {
    //     options.delegate = processorFn
    //   }
    //
    //   this.FILES[file] = {
    //     source,
    //     comments: [],
    //     ast: Parser.parseScript(source.content, options)
    //   }
    // } else {
    //   this.warn(`Parse cache used for ${this.relativePath(file)}`)
    // }
    //
    // return this.FILES[file]
  }

  createJson () {
    this.addTask('Generate JSON', next => {
      this.walk(this.source).forEach((file, i) => {
        if (i === 3) {
          this.parseFile(file)
        }
      })

      setTimeout(next, 600)
    })
  }
}

const Builder = new Generator({
  commands: {
    '--generate': () => {
      Builder.source = process.argv[process.argv.indexOf('--source') + 1]
      Builder.output = path.join(process.cwd(), './docs')
      Builder.createJson()
      Builder.on('complete', () => console.log(JSON.stringify(Builder.data, null, 2)))
    }
  }
})

Builder.run()
