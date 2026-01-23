export type Command = 
  // Navigation
  | 'CURSOR_DOWN'
  | 'CURSOR_UP'
  | 'CURSOR_PAGE_DOWN'
  | 'CURSOR_PAGE_UP'
  | 'JUMP_BOTTOM'
  | 'CENTER_VIEW'      // zz

  // Interaction
  | 'ACTIVATE_SELECTION' // Enter (Open Thread OR Jump to Triage Source)
  | 'GO_BACK'            // Backspace
  | 'ENTER_INSERT'       // i
  | 'CANCEL'             // Escape / Clear buffers
  | 'PEEK_CONTEXT'       // Tab

  // Message Manipulation
  | 'START_EDIT'         // cc
  | 'DELETE_MESSAGE'     // dd
  | 'YANK_MESSAGE'       // yy (Clipboard)
  | 'OPEN_LINK'          // gx (Url)
  
  // Inspector / Files
  | 'OPEN_FILE'          // gf (Open attachment)
  | 'DOWNLOAD_FILE'      // gd (Save attachment)

  // Context Navigation
  | 'JUMP_TO_CONTEXT'    // gp (Jump to thread root in parent channel)
  
  // Modes & Toggles
  | 'QUICK_SWITCH'       // <Leader><Space>
  | 'TOGGLE_INSPECTOR'   // <Leader>e
  | 'TOGGLE_REACTION'   // <Leader>r
  | 'SELECT_NEXT' 
  | 'SELECT_PREV'
  | 'ATTACH_FILE';

export interface KeymapConfig {
    leader: string;
    leaderTimeout: number;
    bindings: Record<string, Command>;
}

export const DEFAULT_KEYMAP: KeymapConfig = {
    leader: ' ',
    leaderTimeout: 400,
    bindings: {
        // Navigation (Viewport / Motion)
        'j': 'CURSOR_DOWN',
        'k': 'CURSOR_UP',
        '<C-d>': 'CURSOR_PAGE_DOWN',
        '<C-u>': 'CURSOR_PAGE_UP',
        'G': 'JUMP_BOTTOM',
        'z z': 'CENTER_VIEW',

        // List Navigation (Selection / Arrows)
        // Arrows now map to Selection, which is "stronger" than simple cursor movement
        'ArrowDown': 'SELECT_NEXT', 
        'ArrowUp': 'SELECT_PREV',
        '<C-j>': 'SELECT_NEXT',
        '<C-n>': 'SELECT_NEXT', 
        '<C-k>': 'SELECT_PREV',
        '<C-p>': 'SELECT_PREV',

        'Enter': 'ACTIVATE_SELECTION',
        'Backspace': 'GO_BACK',
        'Escape': 'CANCEL',
        'Tab': 'PEEK_CONTEXT',
        'i': 'ENTER_INSERT',
        'c c': 'START_EDIT',
        'd d': 'DELETE_MESSAGE',
        'y y': 'YANK_MESSAGE', 
        'g x': 'OPEN_LINK',
        'g f': 'OPEN_FILE',
        'g d': 'DOWNLOAD_FILE',
        'g p': 'JUMP_TO_CONTEXT',
        '<Leader> <Leader>': 'QUICK_SWITCH',
        '<Leader> e': 'TOGGLE_INSPECTOR',
        '<Leader> r': 'TOGGLE_REACTION',
        '<A-a>': 'ATTACH_FILE'
    }
};
