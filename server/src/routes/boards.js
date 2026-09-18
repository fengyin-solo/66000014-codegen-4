const express = require('express');
const router = express.Router();
const { Board } = require('../storage');

// Get all boards for a user
router.get('/', async (req, res) => {
  try {
    const { userId } = req.query;
    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }
    const boards = await Board.find({
      $or: [{ ownerId: userId }, { collaborators: userId }]
    }).sort({ updatedAt: -1 });
    console.log(`[Boards] Fetched ${boards.length} boards for user ${userId}`);
    res.json(boards);
  } catch (err) {
    console.error('[Boards] Error fetching boards:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get a single board
router.get('/:id', async (req, res) => {
  try {
    const board = await Board.findById(req.params.id);
    if (!board) return res.status(404).json({ error: 'Board not found' });
    res.json(board);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create a new board
router.post('/', async (req, res) => {
  try {
    const { name, ownerId, width, height, backgroundColor, layers } = req.body;

    if (!ownerId) {
      return res.status(400).json({ error: 'ownerId is required' });
    }

    const boardData = {
      name: name || 'Untitled Board',
      ownerId,
      width: width || 3000,
      height: height || 2000,
      backgroundColor: backgroundColor || '#ffffff',
    };

    if (layers && Array.isArray(layers)) {
      boardData.layers = layers.map((layer) => ({
        name: layer.name,
        visible: layer.visible,
        locked: layer.locked,
        order: layer.order,
        elements: layer.elements,
      }));
    } else {
      boardData.layers = [{ name: 'Layer 1', visible: true, locked: false, order: 0, elements: [] }];
    }

    const board = new Board(boardData);
    const savedBoard = await board.save();
    console.log(`[Boards] Created board: ${savedBoard._id}, name: ${savedBoard.name}, layers: ${savedBoard.layers.length}`);
    res.status(201).json(savedBoard);
  } catch (err) {
    console.error('[Boards] Error creating board:', err);
    res.status(500).json({ error: err.message });
  }
});

// Update a board
router.put('/:id', async (req, res) => {
  try {
    // Members and comments are managed only through dedicated permission routes.
    const { members, comments, collaborators, ownerId, ...allowed } = req.body;
    const board = await Board.findByIdAndUpdate(req.params.id, allowed, { new: true });
    if (!board) return res.status(404).json({ error: 'Board not found' });
    res.json(board);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete a board
router.delete('/:id', async (req, res) => {
  try {
    const board = await Board.findByIdAndDelete(req.params.id);
    if (!board) return res.status(404).json({ error: 'Board not found' });
    res.json({ message: 'Board deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
