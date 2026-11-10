-- OneShot for Neovim: completion and hover from a small language server that runs inside
-- Neovim, so any completion plugin that reads from LSP (blink.cmp, nvim-cmp, the built-in
-- one) shows OneShot suggestions, and K shows documentation.
-- This is a port of vscode-oneshot/src/completion.js.

local language = require("oneshot.language")

local M = {}

M.config = {
  -- Folder of the libraries that IMPORT loads. By default the lib folder of the OneShot repository.
  lib_path = nil,
}

---@param opts? { lib_path?: string }
function M.setup(opts)
  M.config = vim.tbl_extend("force", M.config, opts or {})
end

-- LSP protocol constants
local Kind = {
  Method = 2, Function = 3, Variable = 6, Class = 7, Module = 9, Keyword = 14,
  Snippet = 15, Color = 16, EnumMember = 20, Constant = 21, Struct = 22,
}
local SNIPPET_FORMAT = 2

local ENTRY_KINDS = {
  keyword = Kind.Keyword,
  block = Kind.Struct,
  command = Kind.Method,
  ["function"] = Kind.Function,
  value = Kind.Constant,
  constant = Kind.Constant,
}

--- The folder of the libraries: the option, or lib/ in the repository this plugin is part of
local function library_folder()
  if M.config.lib_path then
    return M.config.lib_path
  end

  -- This file is <plugin>/lua/oneshot/init.lua, and the plugin is a folder of the repository
  local this_file = debug.getinfo(1, "S").source:sub(2)
  local plugin_root = vim.fn.fnamemodify(this_file, ":p:h:h:h")
  for _, folder in ipairs({ plugin_root .. "/../lib", plugin_root .. "/lib" }) do
    if vim.fn.isdirectory(folder) == 1 then
      return (vim.fn.fnamemodify(folder, ":p"):gsub("[\\/]$", ""))
    end
  end
end

--- Names of the available libraries, like "math"
local function library_names()
  local folder = library_folder()
  if not folder then
    return {}
  end

  local names = {}
  for name, type in vim.fs.dir(folder) do
    if type == "file" and name:match("%.oneshot$") then
      table.insert(names, (name:gsub("%.oneshot$", "")))
    end
  end
  table.sort(names)
  return names
end

--- Scans a buffer, adding the functions and global variables of the libraries it imports.
--- Imported names have a `library` field.
local function scan_with_imports(bufnr)
  local text = table.concat(vim.api.nvim_buf_get_lines(bufnr, 0, -1, false), "\n")
  local scan = language.scan_document(text)
  local folder = library_folder()

  local own_functions, own_variables = {}, {}
  for _, fn in ipairs(scan.functions) do
    own_functions[fn.name] = true
  end
  for _, variable in ipairs(scan.variables) do
    own_variables[variable.name] = true
  end

  local done = {}
  for _, library in ipairs(scan.imports) do
    local file = folder and io.open(folder .. "/" .. library .. ".oneshot", "r")
    if file and not done[library] then
      done[library] = true
      local library_scan = language.scan_document(file:read("*a"))
      file:close()

      for _, fn in ipairs(library_scan.functions) do
        if not own_functions[fn.name] then
          own_functions[fn.name] = true
          table.insert(scan.functions, vim.tbl_extend("force", fn, { library = library }))
        end
      end
      for _, variable in ipairs(library_scan.variables) do
        if variable.top_level and not own_variables[variable.name] then
          own_variables[variable.name] = true
          table.insert(scan.variables, vim.tbl_extend("force", variable, { library = library }))
        end
      end
    elseif file then
      file:close()
    end
  end

  return scan
end

--- Whether a position is in code, in a string or in a comment, given the text of the line before it
---@param line_prefix string
---@return "code"|"string"|"comment"
local function cursor_context(line_prefix)
  local in_string = false
  for char in line_prefix:gmatch(".") do
    if char == '"' then
      in_string = not in_string
    elseif char == "#" and not in_string then
      return "comment"
    end
  end
  return in_string and "string" or "code"
end

local function markdown(value)
  return { kind = "markdown", value = value }
end

local function entry_documentation(entry)
  return markdown("```oneshot\n" .. entry.signature .. "\n```\n" .. entry.doc)
end

local function function_signature(fn)
  return "FUNC " .. fn.name .. "(" .. table.concat(fn.params, ", ") .. ")"
end

local function function_snippet(fn)
  local params = {}
  for i, param in ipairs(fn.params) do
    table.insert(params, "${" .. i .. ":" .. param .. "}")
  end
  return fn.name .. "(" .. table.concat(params, ", ") .. ")"
end

--- Inside a string, what to suggest depends on the command the string belongs to.
--- Each pattern is matched against the text of the line before the cursor. The first that matches wins.
local STRING_CONTEXTS = {
  {
    -- DRAW x, y, "SPRITE", "| → the frames of that sprite
    pattern = '%f[%w_]DRAW%s+[^,]*,[^,]*,%s*"([^"]*)"%s*,%s*"[^"]*$',
    kind = Kind.EnumMember,
    items = function(scan, sprite_name)
      local items = {}
      for _, sprite in ipairs(scan.sprites) do
        if sprite.name == sprite_name then
          for index, frame in ipairs(sprite.frames) do
            if frame then
              table.insert(items, { label = frame, detail = "Frame " .. (index - 1) .. " of " .. sprite.name })
            end
          end
          break
        end
      end
      return items
    end,
  },
  {
    -- DRAW x, y, "| → sprites
    pattern = '%f[%w_]DRAW%s+[^,]*,[^,]*,%s*"[^"]*$',
    kind = Kind.Class,
    items = function(scan)
      return vim.tbl_map(function(sprite)
        return { label = sprite.name, detail = "Sprite with " .. #sprite.frames .. " frame(s)" }
      end, scan.sprites)
    end,
  },
  {
    pattern = '%f[%w_]PLAY%s+"[^"]*$',
    kind = Kind.Class,
    items = function(scan)
      return vim.tbl_map(function(song) return { label = song.name, detail = "Song" } end, scan.songs)
    end,
  },
  {
    pattern = '%f[%w_]STOP%s+"[^"]*$',
    kind = Kind.Class,
    items = function(scan)
      return vim.tbl_map(function(song) return { label = song.name, detail = "Song" } end, scan.songs)
    end,
  },
  {
    pattern = '%f[%w_]INPUT%s*%(%s*"[^"]*$',
    kind = Kind.Constant,
    items = function()
      return vim.tbl_map(function(key)
        return { label = key[1] == " " and "SPACE" or key[1], insert_text = key[1], detail = key[2] }
      end, language.KEY_NAMES)
    end,
  },
  {
    pattern = '%f[%w_]TYPE%s+"[^"]*$',
    kind = Kind.EnumMember,
    items = function()
      return vim.tbl_map(function(type) return { label = type, detail = "Wave type" } end, language.WAVE_TYPES)
    end,
  },
  {
    -- COLOR "| and the color of COLORDATA "#", "|
    pattern = '%f[%w_]COLOR%s*"[^"]*$',
    kind = Kind.Color,
    items = function()
      return vim.tbl_map(function(color) return { label = color[1], detail = color[2] } end, language.COLORS)
    end,
  },
  {
    pattern = '%f[%w_]COLORDATA%s+"[^"]*"%s*,%s*"[^"]*$',
    kind = Kind.Color,
    items = function()
      return vim.tbl_map(function(color) return { label = color[1], detail = color[2] } end, language.COLORS)
    end,
  },
}

local function string_completions(bufnr, position, line_prefix)
  for _, context in ipairs(STRING_CONTEXTS) do
    local capture = line_prefix:match(context.pattern)
    if capture then
      -- Replace everything between the opening quote and the cursor
      local quote = line_prefix:match('.*()"')
      local range = {
        start = { line = position.line, character = quote },
        ["end"] = { line = position.line, character = position.character },
      }

      return vim.tbl_map(function(item)
        local text = item.insert_text or item.label
        return {
          label = item.label,
          kind = context.kind,
          detail = item.detail,
          documentation = context.kind == Kind.Color and item.detail or nil,
          filterText = item.label,
          textEdit = { range = range, newText = text },
        }
      end, context.items(scan_with_imports(bufnr), capture))
    end
  end

  return {}
end

local function code_completions(bufnr)
  local scan = scan_with_imports(bufnr)
  local items = {}

  -- The program's own names, and the names it imports, come first
  local function_names = {}
  for _, fn in ipairs(scan.functions) do
    function_names[fn.name] = true
    table.insert(items, {
      label = fn.name,
      kind = Kind.Function,
      detail = function_signature(fn) .. (fn.library and (" from " .. fn.library) or ""),
      documentation = fn.doc ~= "" and markdown(fn.doc) or nil,
      insertText = function_snippet(fn),
      insertTextFormat = SNIPPET_FORMAT,
      sortText = "0" .. fn.name,
    })
  end

  for _, variable in ipairs(scan.variables) do
    if not function_names[variable.name] then
      local detail
      if variable.parameter_of then
        detail = "Parameter of " .. variable.parameter_of
      else
        detail = (variable.is_array and ("LET " .. variable.name .. "[...]") or ("LET " .. variable.name))
          .. (variable.library and (" from " .. variable.library) or "")
      end
      table.insert(items, { label = variable.name, kind = Kind.Variable, detail = detail, sortText = "0" .. variable.name })
    end
  end

  for _, entry in ipairs(language.ENTRIES) do
    table.insert(items, {
      label = entry.name,
      kind = ENTRY_KINDS[entry.kind],
      detail = vim.split(entry.signature, "\n")[1],
      documentation = entry_documentation(entry),
      insertText = entry.snippet,
      insertTextFormat = entry.snippet and SNIPPET_FORMAT or nil,
      sortText = "1" .. entry.name,
    })
  end

  for _, snippet in ipairs(language.SNIPPETS) do
    table.insert(items, {
      label = snippet.label,
      kind = Kind.Snippet,
      documentation = markdown(snippet.doc),
      insertText = snippet.body,
      insertTextFormat = SNIPPET_FORMAT,
      sortText = "2" .. snippet.label,
    })
  end

  return items
end

local function line_text(bufnr, line)
  return vim.api.nvim_buf_get_lines(bufnr, line, line + 1, false)[1] or ""
end

local function completion(params)
  local bufnr = vim.uri_to_bufnr(params.textDocument.uri)
  local position = params.position
  local line_prefix = line_text(bufnr, position.line):sub(1, position.character)
  local context = cursor_context(line_prefix)

  if context == "comment" then
    return {}
  elseif context == "string" then
    return string_completions(bufnr, position, line_prefix)
  end

  if line_prefix:match("%f[%w_]IMPORT%s+[%w_]*$") then
    return vim.tbl_map(function(name)
      return { label = name, kind = Kind.Module, detail = "lib/" .. name .. ".oneshot" }
    end, library_names())
  end

  return code_completions(bufnr)
end

local function hover(params)
  local bufnr = vim.uri_to_bufnr(params.textDocument.uri)
  local line = line_text(bufnr, params.position.line)
  local column = params.position.character + 1

  -- The word under the cursor
  local start, finish
  local init = 1
  while true do
    local s, e = line:find("[%a_][%w_]*", init)
    if not s or s > column then
      break
    end
    if column <= e then
      start, finish = s, e
      break
    end
    init = e + 1
  end
  if not start or cursor_context(line:sub(1, start - 1)) ~= "code" then
    return nil
  end

  local word = line:sub(start, finish)
  local range = {
    start = { line = params.position.line, character = start - 1 },
    ["end"] = { line = params.position.line, character = finish },
  }

  local entry = language.ENTRIES_BY_NAME[word]
  if entry then
    return { contents = entry_documentation(entry), range = range }
  end

  local scan = scan_with_imports(bufnr)
  local function declared_at(item)
    return item.library and ("From the " .. item.library .. " library") or ("Declared on line " .. (item.line + 1))
  end

  for _, fn in ipairs(scan.functions) do
    if fn.name == word then
      local doc = fn.doc ~= "" and (fn.doc .. "\n\n") or ""
      return { contents = markdown("```oneshot\n" .. function_signature(fn) .. "\n```\n" .. doc .. declared_at(fn)), range = range }
    end
  end

  for _, variable in ipairs(scan.variables) do
    if variable.name == word then
      local value
      if variable.parameter_of then
        value = "Parameter of `" .. variable.parameter_of .. "`"
      else
        local declaration = variable.is_array and ("LET " .. word .. "[...]") or ("LET " .. word)
        value = "```oneshot\n" .. declaration .. "\n```\n" .. declared_at(variable)
      end
      return { contents = markdown(value), range = range }
    end
  end

  return nil
end

local HANDLERS = {
  initialize = function()
    return {
      capabilities = {
        -- Positions are byte offsets in the line, which is what Neovim uses itself
        positionEncoding = "utf-8",
        textDocumentSync = { openClose = true, change = 1 },
        completionProvider = { triggerCharacters = { '"' } },
        hoverProvider = true,
      },
      serverInfo = { name = "oneshot" },
    }
  end,
  shutdown = function() return vim.NIL end,
  ["textDocument/completion"] = completion,
  ["textDocument/hover"] = hover,
}

--- An in-process language server. The documents are read from their buffers when needed,
--- so document sync notifications can be ignored.
local function server(dispatchers)
  local closing = false
  local next_id = 0

  return {
    request = function(method, params, callback)
      next_id = next_id + 1
      local handler = HANDLERS[method]
      vim.schedule(function()
        if not handler then
          callback({ code = -32601, message = "Method not found: " .. method }, nil)
          return
        end

        local ok, result = pcall(handler, params)
        if ok then
          callback(nil, result == nil and vim.NIL or result)
        else
          callback({ code = -32603, message = tostring(result) }, nil)
        end
      end)
      return true, next_id
    end,
    notify = function(method)
      if method == "exit" then
        closing = true
        dispatchers.on_exit(0, 0)
      end
      return true
    end,
    is_closing = function() return closing end,
    terminate = function() closing = true end,
  }
end

--- Starts the OneShot language server for a buffer, or attaches the buffer to the running one
---@param bufnr integer
function M.attach(bufnr)
  vim.lsp.start({
    name = "oneshot",
    cmd = server,
    -- One server for every OneShot file
    root_dir = library_folder() or vim.fn.getcwd(),
  }, { bufnr = bufnr })
end

-- Exposed for tests
M._completion = completion
M._hover = hover

return M
