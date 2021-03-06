// Recognizes method.function arguments (parameters)
const Tag = require('./Tag')

class TagProcessor extends Tag {
  constructor () {
    super(...arguments)

    let param = null

    // Identify callback
    if (this.value.indexOf('.') > 0 || this.value.toLowerCase() === 'callback' || this.type.indexOf('function') >= 0) {
      let namespace = this.value.split('.')
      let scope = namespace.shift()
      let method = this.snippet

      if (['property', 'argument'].indexOf(this.snippet.type) >= 0 && LAST_ENTITY.type === 'method') {
        method = LAST_ENTITY
      }

      if (!method.parameters.has(scope)) {
        param = new DOC.Parameter(this.snippet.NODE, this.snippet.SOURCE)
        param.label = scope
        param.callback = new DOC.Method(this.snippet.NODE, this.snippet.SOURCE, true)
        param.callback.label = scope
        param.callback.code = this.raw
        param.callback.start = this.snippet.start
        param.callback.end = this.snippet.end

        this.snippet.commentedParamCount++
      } else {
        param = method.parameters.get(scope)

        if (namespace.length === 0 && !param.isCallbackFunction && (this.type === 'function' && param.datatype !== 'function')) {
          param.callback = new DOC.Method(this.snippet.NODE, this.snippet.SOURCE, true)
          param.callback.label = scope
          param.callback.code = this.raw
          param.callback.start = this.snippet.start
          param.callback.end = this.snippet.end

          this.snippet.commentedParamCount++
        }
      }

      if (param.isCallbackFunction && namespace.length === 0) {
        param.callback.description = this.description
      }

      if (namespace.length > 0 && param.isCallbackFunction && !param.callback.parameters.has(namespace.join('.'))) {
        let newParameter = param.callback.createParameter(this.snippet.NODE, namespace.join('.'))

        newParameter.label = namespace.join('.') || newParameter.label
        newParameter.description = this.description
        newParameter.datatype = this.type || newParameter.datatype
        newParameter.required = this.required
        newParameter.default = this.default
        newParameter.enum = this.options
        newParameter.code = this.raw
        newParameter.start = param.start
        newParameter.end = param.end

        param.callback.parameters.set(newParameter.label, newParameter)
      }

      let oldParameter = method.parameterIndex.get(this.snippet.commentedParamCount - 1)

      if (oldParameter) {
        param.start = oldParameter.argument.start
        param.end = oldParameter.argument.end
        method.parameters.set(oldParameter.argument.label, param)
        method.reMap(method.parameters, oldParameter.argument.label, param.label)
      } else {
        method.parameters.set(param.label, param)
      }

      return
    }

    if (['class'].indexOf(this.snippet.type) >= 0) {
      BUS.emit('skipped.tag', this, 'Parameters/arguments cannot be assigned to a class.', this.snippet)
      return
    }

    // If the parameter is not a callback, handle it like a normal parameter.
    if (param === null) {
      try {
        param = this.snippet.parameterIndex.get(this.snippet.commentedParamCount)
      } catch (e) {
        if (LAST_ENTITY.type === 'method') {
          try {
            param = { argument: this.snippet.parameterIndex.get(this.snippet.commentedParamCount) }
          } catch (ee) {
            param = { argument: LAST_ENTITY.createParameter(this.snippet.NODE, this.value) }
          }
        } else {
          console.log(this)
          console.log(LAST_ENTITY.type)
          console.log('-->', LAST_ENTITY.label, LAST_ENTITY.type, LAST_ENTITY.parameterIndex.size, '<--', this)
          console.log(this.snippet.sourcefile)
          console.log(e)
          process.exit(1)
        }
      }
    }

    let parameter = !param ? this.snippet.createParameter(this.snippet.NODE, this.value) : param.argument

    parameter.description = this.description
    parameter.label = this.value || parameter.label
    parameter.datatype = this.type || parameter.datatype
    parameter.required = this.required
    parameter.default = this.default
    parameter.enum = this.options

    // if (parameter.end.line === 0) {
    //   parameter.start = this.snippet.start
    //   parameter.end = this.snippet.end
    // }

    if (parameter.code === null) {
      parameter.code = this.raw
      BUS.emit('warning', `No source code found for "${parameter.label}" parameter ${parameter.start.line > 0 ? 'near' : 'in'} ${this.snippet.sourcefile}:${parameter.start.line}`)
    }

    if (['property', 'argument'].indexOf(this.snippet.type) >= 0) {
      LAST_ENTITY.parameters.set(parameter.label, parameter)
    } else {
      try {
        this.snippet.parameters.set(parameter.label, parameter)
      } catch (e) {
        LAST_ENTITY.parameters.set(parameter.label, parameter)
      }
    }

    this.snippet.commentedParamCount++
  }
}

module.exports = TagProcessor
