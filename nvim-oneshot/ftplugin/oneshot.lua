if vim.b.did_ftplugin then
  return
end
vim.b.did_ftplugin = true

vim.bo.commentstring = "# %s"
vim.bo.comments = ":#"

vim.b.undo_ftplugin = "setlocal commentstring< comments<"

-- Completion and hover come from a small language server that runs inside Neovim
require("oneshot").attach(vim.api.nvim_get_current_buf())
