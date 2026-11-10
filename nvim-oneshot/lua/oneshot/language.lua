-- Everything the editor knows about the OneShot language: the built-in words with their
-- documentation, and a light scan of a document for the names it declares.
-- This is a port of vscode-oneshot/src/language.js, keep the two in sync.

local M = {}

---@class oneshot.Entry
---@field name string
---@field kind "keyword"|"block"|"command"|"function"|"value"|"constant"
---@field signature string Shown in hovers and completion details
---@field doc string Markdown
---@field snippet? string Inserted on completion, in LSP snippet syntax

---@type oneshot.Entry[]
M.ENTRIES = {
  -- Keywords
  { name = "LET", kind = "keyword", signature = "LET NAME = value\nLET NAME[size]", doc = "Declares a variable, or an array of `size` elements filled with `NULL`.", snippet = "LET ${1:NAME} = ${2:0}" },
  { name = "IF", kind = "keyword", signature = "IF (condition) THEN ... ELSE ... END", doc = "Runs the first block when the condition is truthy, otherwise the `ELSE` block. There is no `ELSE IF`: put another `IF` inside the `ELSE`.", snippet = "IF (${1:condition}) THEN\n\t$0\nEND" },
  { name = "ELSE", kind = "keyword", signature = "ELSE", doc = "Starts the block of an `IF` that runs when the condition is falsy." },
  { name = "WHILE", kind = "keyword", signature = "WHILE (condition) THEN ... END", doc = "Repeats the block while the condition is truthy.", snippet = "WHILE (${1:TRUE}) THEN\n\t$0\nEND" },
  { name = "FOR", kind = "keyword", signature = "FOR (initializer : condition : increment) THEN ... END", doc = "Runs the initializer once, then repeats the block and the increment while the condition is truthy. The loop variable only exists inside the loop.", snippet = "FOR (LET ${1:I} = ${2:0} : $1 < ${3:10} : $1++) THEN\n\t$0\nEND" },
  { name = "THEN", kind = "keyword", signature = "THEN ... END", doc = "Starts a block. On its own, `THEN ... END` is a block with its own scope." },
  { name = "END", kind = "keyword", signature = "END", doc = "Closes a block." },
  { name = "FUNC", kind = "keyword", signature = "FUNC NAME(params) THEN ... END", doc = "Declares a function. Functions are values, can be recursive and remember the variables around them.", snippet = "FUNC ${1:NAME}(${2}) THEN\n\t$0\nEND" },
  { name = "IMPORT", kind = "keyword", signature = "IMPORT library", doc = "Runs a library from the `lib` folder once, so its functions and variables can be used, like `IMPORT math` for `lib/math.oneshot`.", snippet = "IMPORT ${1:math}" },
  { name = "RETURN", kind = "keyword", signature = "RETURN (value)\nRETURN ()", doc = "Leaves the function, returning `value`. The parentheses are required.", snippet = "RETURN (${1})" },
  { name = "AND", kind = "keyword", signature = "a AND b", doc = "Logical and. The right side is only evaluated when the left side is truthy." },
  { name = "OR", kind = "keyword", signature = "a OR b", doc = "Logical or. The right side is only evaluated when the left side is falsy." },
  { name = "TRUE", kind = "constant", signature = "TRUE", doc = "The boolean true." },
  { name = "FALSE", kind = "constant", signature = "FALSE", doc = "The boolean false. Only `FALSE` and `NULL` are falsy." },
  { name = "NULL", kind = "constant", signature = "NULL", doc = "No value. Variables declared without a value, and array elements, start as `NULL`." },
  { name = "ALL", kind = "constant", signature = "FILL ALL", doc = "Used with `FILL` to fill the whole window." },

  -- Built-in functions and values
  { name = "RANDOM", kind = "function", signature = "RANDOM() → number", doc = "A random number from 0 up to (but not including) 1.", snippet = "RANDOM()" },
  { name = "INPUT", kind = "function", signature = "INPUT(key) → boolean", doc = "`TRUE` while the key is held down, e.g. `\"W\"`, `\"ARROWUP\"`, `\"ESCAPE\"` or `\" \"` for space. A quick tap counts as held until the next `SLEEP`.", snippet = "INPUT(\"${1:W}\")" },
  { name = "INT", kind = "function", signature = "INT(value) → number", doc = "The value as a whole number, dropping the fraction. Also converts text like `\"42\"`.", snippet = "INT(${1:value})" },
  { name = "FLOOR", kind = "function", signature = "FLOOR(x) → number", doc = "Rounds down to a whole number.", snippet = "FLOOR(${1:x})" },
  { name = "CEIL", kind = "function", signature = "CEIL(x) → number", doc = "Rounds up to a whole number.", snippet = "CEIL(${1:x})" },
  { name = "SQRT", kind = "function", signature = "SQRT(x) → number", doc = "The square root.", snippet = "SQRT(${1:x})" },
  { name = "LEN", kind = "function", signature = "LEN(value) → number", doc = "The number of elements of an array, or of characters of a text.", snippet = "LEN(${1:array})" },
  { name = "MOUSEX", kind = "value", signature = "MOUSEX → number", doc = "The horizontal mouse position on the canvas, in canvas pixels. Used without parentheses." },
  { name = "MOUSEY", kind = "value", signature = "MOUSEY → number", doc = "The vertical mouse position on the canvas, in canvas pixels. Used without parentheses." },

  -- Commands
  { name = "PRINT", kind = "command", signature = "PRINT value", doc = "Prints a value to the output.", snippet = "PRINT ${1:value}" },
  { name = "DEBUG", kind = "command", signature = "DEBUG value", doc = "Logs a value to the developer console.", snippet = "DEBUG ${1:value}" },
  { name = "SLEEP", kind = "command", signature = "SLEEP milliseconds", doc = "Waits. A game loop usually ends with `SLEEP 1000 / 60` to run at 60 frames per second.", snippet = "SLEEP ${1:1000 / 60}" },
  { name = "WINDOW", kind = "command", signature = "WINDOW width, height", doc = "Sets the size of the canvas.", snippet = "WINDOW ${1:320}, ${2:240}" },
  { name = "COLOR", kind = "command", signature = "COLOR color", doc = "Sets the color of `FILL` and `TEXT`. Any CSS color works: `\"RED\"`, `\"#FF8800\"`, `\"rgb(0, 128, 255)\"`, `\"hsl(200, 80%, 60%)\"`.", snippet = "COLOR \"${1:WHITE}\"" },
  { name = "FILL", kind = "command", signature = "FILL x, y, width, height\nFILL ALL", doc = "Draws a rectangle in the current color, or fills the whole window.", snippet = "FILL ${1:x}, ${2:y}, ${3:width}, ${4:height}" },
  { name = "TEXT", kind = "command", signature = "TEXT x, y, text", doc = "Draws text in the current color, with `y` at the baseline of the text.", snippet = "TEXT ${1:x}, ${2:y}, ${3:\"text\"}" },
  { name = "DRAW", kind = "command", signature = "DRAW x, y, sprite, frame", doc = "Draws a frame of a sprite. The frame is a name or an index.", snippet = "DRAW ${1:x}, ${2:y}, \"${3:SPRITE}\", ${4:0}" },

  -- Sprites
  { name = "SPRITE", kind = "block", signature = "SPRITE name ... END", doc = "Defines a sprite: pixel art written as text. Every character is drawn as a 4 x 4 pixel square.", snippet = "SPRITE \"${1:NAME}\"\n\tSIZE ${2:4}, ${3:4}\n\tFRAME \"${4:IDLE}\"\n\t\tCOLORDATA \"#\", \"${5:WHITE}\"\n\t\tPIXELDATA \" ## \"\n\t\tPIXELDATA \"####\"\n\t\tPIXELDATA \"####\"\n\t\tPIXELDATA \" ## \"\n\tEND\nEND" },
  { name = "SIZE", kind = "command", signature = "SIZE width, height", doc = "The size of a sprite in characters. `PIXELDATA` rows are checked against it.", snippet = "SIZE ${1:8}, ${2:8}" },
  { name = "FRAME", kind = "block", signature = "FRAME name ... END", doc = "One image of a sprite. The name is optional, since frames can also be drawn by index.", snippet = "FRAME \"${1:NAME}\"\n\tCOLORDATA \"#\", \"${2:WHITE}\"\n\tPIXELDATA \"$0\"\nEND" },
  { name = "COLORDATA", kind = "command", signature = "COLORDATA character, color", doc = "Maps a character of `PIXELDATA` to a color. Characters without a color are transparent.", snippet = "COLORDATA \"${1:#}\", \"${2:WHITE}\"" },
  { name = "PIXELDATA", kind = "command", signature = "PIXELDATA row", doc = "Adds one row of pixels to the frame.", snippet = "PIXELDATA \"${1}\"" },

  -- Music
  { name = "SONG", kind = "block", signature = "SONG name ... END", doc = "Defines a song made of `SHEET`s that play at the same time.", snippet = "SONG \"${1:NAME}\"\n\tBPM ${2:120}\n\tSHEET\n\t\tTYPE \"${3:square}\"\n\t\tGAIN ${4:30}\n\t\tBAR \"${5:C4 E4 G4 ..}\"\n\tEND\nEND" },
  { name = "SHEET", kind = "block", signature = "SHEET ... END", doc = "One voice of a song.", snippet = "SHEET\n\tTYPE \"${1:square}\"\n\tBAR \"${2:C4 E4 G4 ..}\"\nEND" },
  { name = "BAR", kind = "command", signature = "BAR notes", doc = "Adds notes to a sheet, like `\"C4 F#4 Bb3\"`. Every note lasts one beat, `--` is a rest and `..` holds the previous note one more beat.", snippet = "BAR \"${1:C4 D4 E4 F4}\"" },
  { name = "BPM", kind = "command", signature = "BPM beatsPerMinute", doc = "The speed of a song (default 120).", snippet = "BPM ${1:120}" },
  { name = "LOOP", kind = "command", signature = "LOOP boolean", doc = "Whether the song starts over when it ends.", snippet = "LOOP ${1:TRUE}" },
  { name = "TYPE", kind = "command", signature = "TYPE wave", doc = "The sound of a sheet: `\"sine\"` (default), `\"square\"`, `\"sawtooth\"` or `\"triangle\"`.", snippet = "TYPE \"${1|sine,square,sawtooth,triangle|}\"" },
  { name = "GAIN", kind = "command", signature = "GAIN volume", doc = "The volume of a sheet, from 0 to 100 (default 80).", snippet = "GAIN ${1:50}" },
  { name = "PLAY", kind = "command", signature = "PLAY song", doc = "Starts playing a song in the background.", snippet = "PLAY \"${1:SONG}\"" },
  { name = "STOP", kind = "command", signature = "STOP song", doc = "Stops a song.", snippet = "STOP \"${1:SONG}\"" },
}

---@type table<string, oneshot.Entry>
M.ENTRIES_BY_NAME = {}
for _, entry in ipairs(M.ENTRIES) do
  M.ENTRIES_BY_NAME[entry.name] = entry
end

-- Snippets that are not tied to a single keyword
M.SNIPPETS = {
  {
    label = "game loop",
    doc = "A window and a loop that runs 60 times per second.",
    body = "WINDOW ${1:320}, ${2:240}\n\nWHILE (TRUE) THEN\n\tCOLOR \"${3:BLACK}\"\n\tFILL ALL\n\n\t$0\n\n\tSLEEP 1000 / 60\nEND",
  },
  {
    label = "key press",
    doc = "Reacts once when a key is pressed, instead of on every frame it is held. Declare `LET KEYWASDOWN = FALSE` before the loop.",
    body = "LET ${1:KEY}DOWN = INPUT(\"${2: }\")\nIF (${1:KEY}DOWN AND !${1:KEY}WASDOWN) THEN\n\t$0\nEND\n${1:KEY}WASDOWN = ${1:KEY}DOWN",
  },
}

-- Names that INPUT understands (upper-cased KeyboardEvent.key values)
M.KEY_NAMES = {
  { "ARROWUP", "Up arrow" }, { "ARROWDOWN", "Down arrow" }, { "ARROWLEFT", "Left arrow" }, { "ARROWRIGHT", "Right arrow" },
  { " ", "Space" }, { "ENTER", "Enter" }, { "ESCAPE", "Escape" }, { "SHIFT", "Shift" }, { "CONTROL", "Control" },
  { "TAB", "Tab" }, { "BACKSPACE", "Backspace" },
}
for key in ("WASDQERFZXC0123456789"):gmatch(".") do
  table.insert(M.KEY_NAMES, { key, "The " .. key .. " key" })
end

M.WAVE_TYPES = { "sine", "square", "sawtooth", "triangle" }

-- A few CSS colors, with hex values
M.COLORS = {
  { "BLACK", "#000000" }, { "WHITE", "#FFFFFF" }, { "GRAY", "#808080" }, { "RED", "#FF0000" }, { "ORANGE", "#FFA500" },
  { "YELLOW", "#FFFF00" }, { "GOLD", "#FFD700" }, { "GREEN", "#008000" }, { "LIME", "#00FF00" }, { "CYAN", "#00FFFF" },
  { "BLUE", "#0000FF" }, { "NAVY", "#000080" }, { "PURPLE", "#800080" }, { "MAGENTA", "#FF00FF" }, { "PINK", "#FFC0CB" },
  { "BROWN", "#A52A2A" }, { "SKYBLUE", "#87CEEB" }, { "TRANSPARENT", "#00000000" },
}

--- Two copies of the text with the same byte positions: `code` has its comments blanked out,
--- and `bare` also has the inside of its strings blanked out, so keywords are only found in code.
--- Strings are found first, so a # inside a string is not mistaken for a comment.
---@param text string
---@return string code, string bare
local function blank(text)
  local code, bare = {}, {}
  local i, n = 1, #text

  while i <= n do
    local s = text:find('[#"]', i)
    if not s then
      local rest = text:sub(i)
      table.insert(code, rest)
      table.insert(bare, rest)
      break
    end

    local before = text:sub(i, s - 1)
    table.insert(code, before)
    table.insert(bare, before)

    if text:sub(s, s) == '"' then
      local e = text:find('"', s + 1, true)
      if e then
        local str = text:sub(s, e)
        table.insert(code, str)
        table.insert(bare, '"' .. str:sub(2, -2):gsub("[^\n]", " ") .. '"')
        i = e + 1
      else
        -- An unterminated string is left as it is
        table.insert(code, '"')
        table.insert(bare, '"')
        i = s + 1
      end
    else
      local e = (text:find("\n", s, true) or (n + 1)) - 1
      local spaces = string.rep(" ", e - s + 1)
      table.insert(code, spaces)
      table.insert(bare, spaces)
      i = e + 1
    end
  end

  return table.concat(code), table.concat(bare)
end

--- Finds every match of a pattern, with its start position and captures
local function find_all(text, pattern)
  local matches = {}
  local init = 1
  while true do
    local result = { text:find(pattern, init) }
    if not result[1] then
      break
    end
    table.insert(matches, result)
    init = result[2] + 1
  end
  return matches
end

--- Finds the names a document declares. This is a light pattern scan,
--- so it also works while the document has syntax errors. Lines are 0-based.
---@param text string
function M.scan_document(text)
  local code, bare = blank(text)

  -- Start positions of the lines, to turn a byte position into a line number
  local line_starts = { 1 }
  for position in bare:gmatch("()\n") do
    table.insert(line_starts, position + 1)
  end
  local function line_of(position)
    local low, high = 1, #line_starts
    while low < high do
      local middle = math.floor((low + high + 1) / 2)
      if line_starts[middle] <= position then
        low = middle
      else
        high = middle - 1
      end
    end
    return low - 1
  end

  local lines = vim.split(text, "\r?\n")

  -- The # comment lines right above a FUNC document it
  local function comment_above(line)
    local comments = {}
    local i = line -- `lines` is 1-based, so this is the line above
    while i >= 1 and lines[i]:match("^%s*#") do
      table.insert(comments, 1, (lines[i]:gsub("^%s*#%s?", "")))
      i = i - 1
    end
    return table.concat(comments, " ")
  end

  local functions = {}
  for _, match in ipairs(find_all(bare, "%f[%w_]FUNC%s+([%a_][%w_]*)%s*%(([^)]*)%)")) do
    local params = {}
    for param in match[4]:gmatch("[^,]+") do
      param = vim.trim(param)
      if param ~= "" then
        table.insert(params, param)
      end
    end
    local line = line_of(match[1])
    table.insert(functions, { name = match[3], params = params, line = line, doc = comment_above(line) })
  end

  local variables, seen = {}, {}
  for _, match in ipairs(find_all(bare, "%f[%w_]LET%s+([%a_][%w_]*)%s*(%[?)")) do
    local name = match[3]
    if not seen[name] then
      seen[name] = true
      -- Libraries only share the variables declared at the start of a line, outside of blocks
      local top_level = match[1] == 1 or bare:sub(match[1] - 1, match[1] - 1) == "\n"
      table.insert(variables, { name = name, is_array = match[4] == "[", line = line_of(match[1]), top_level = top_level })
    end
  end
  for _, fn in ipairs(functions) do
    for _, param in ipairs(fn.params) do
      if not seen[param] then
        seen[param] = true
        table.insert(variables, { name = param, is_array = false, line = fn.line, parameter_of = fn.name })
      end
    end
  end

  local imports = {}
  for _, match in ipairs(find_all(bare, "%f[%w_]IMPORT%s+([%a_][%w_]*)")) do
    table.insert(imports, match[3]:lower())
  end

  -- Frames belong to the SPRITE before them
  local blocks = {}
  for _, keyword in ipairs({ "SPRITE", "SONG", "FRAME" }) do
    for _, match in ipairs(find_all(bare, "%f[%w_]" .. keyword .. "%f[^%w_]%s*(\"?)")) do
      table.insert(blocks, { keyword = keyword, start = match[1], name_start = match[2] + 1, quoted = match[3] == '"' })
    end
  end
  table.sort(blocks, function(a, b) return a.start < b.start end)

  local sprites, songs = {}, {}
  for _, block in ipairs(blocks) do
    -- Read the name from the copy that still has the inside of the strings
    local name
    if block.quoted then
      local close = code:find('"', block.name_start, true)
      name = code:sub(block.name_start, (close or (#code + 1)) - 1)
    end

    if block.keyword == "SPRITE" and name then
      table.insert(sprites, { name = name, frames = {}, line = line_of(block.start) })
    elseif block.keyword == "SONG" and name then
      table.insert(songs, { name = name, line = line_of(block.start) })
    elseif block.keyword == "FRAME" and #sprites > 0 then
      -- Unnamed frames are false, so the frame indexes stay right
      table.insert(sprites[#sprites].frames, name or false)
    end
  end

  return { functions = functions, variables = variables, sprites = sprites, songs = songs, imports = imports }
end

return M
