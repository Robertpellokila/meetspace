
import {
  createRoom,
  getRoomById,
} from "../services/room.service.js";

import { createLiveKitToken } from '../services/livekit.service.js'

// Mode dan theme yang diizinkan
const validModes = ["professional", "watchParty"];
const validThemes = ["midnight", "romantic"];

const allowedThemes = {
  professional: ["midnight", "romantic"],
  watchParty: ["romantic", "midnight"],
};

// POST /api/rooms
export async function createRoomController(req, res) {
  const { name, mode, theme } = req.body ?? {};

  // Validasi nama room
  if (
    typeof name !== "string" ||
    !name.trim() ||
    name.trim().length > 80
  ) {
    return res.status(400).json({
      success: false,
      message: "Room name must be 1-80 characters",
    });
  }

  // Validasi mode
  if (!validModes.includes(mode)) {
    return res.status(400).json({
      success: false,
      message: "Invalid room mode",
    });
  }

  // Validasi theme
  if (!validThemes.includes(theme)) {
    return res.status(400).json({
      success: false,
      message: "Invalid room theme",
    });
  }

  // Validasi kombinasi mode dan theme
  if (!allowedThemes[mode].includes(theme)) {
    return res.status(400).json({
      success: false,
      message: "Theme is not available for this mode",
    });
  }

  // Memanggil service untuk membuat room
  const room = await createRoom({
    hostUid:req.user?.uid,
    name: name.trim(),
    mode,
    theme,
  });

  // Mengirim response sukses
  return res.status(201).json({
    success: true,
    message: "Room created successfully",
    data: room,
  });
}

// GET /api/rooms/:roomId
export async function getRoomController(req, res) {
  const { roomId } = req.params;

  const room = await getRoomById(roomId);

  if (!room) {
    return res.status(404).json({
      success: false,
      message: "Room not found",
    });
  }

  return res.status(200).json({
    success: true,
    data: room,
  });
}



export async function createRoomTokenController(req, res) {
  try {
    const { roomId } = req.params
    const { participantName } = req.body ?? {}

    const room = await getRoomById(roomId)

    if (!room) {
      return res.status(404).json({
        success: false,
        message: 'Room not found',
      })
    }

    if (
      typeof participantName !== 'string' ||
      !participantName.trim() ||
      participantName.trim().length > 50
    ) {
      return res.status(400).json({
        success: false,
        message: 'Participant name must be 1-50 characters',
      })
    }

    const credentials = await createLiveKitToken({
      roomId: room.id,
      participantName: participantName.trim(),
    })

    return res.status(200).json({
      success: true,
      message: 'Meeting token generated',
      data: {
        ...credentials,
        room: {
          id: room.id,
          name: room.name,
          mode: room.mode,
          theme: room.theme,
        },
      },
    })
  } catch (error) {
    console.error('LiveKit token error:', error)

    return res.status(500).json({
      success: false,
      message: 'Unable to generate meeting token',
    })
  }
}
