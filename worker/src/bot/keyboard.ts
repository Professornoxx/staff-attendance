import { Keyboard } from 'grammy';

// Shown to staff who are not yet active (pending approval / disabled) — only Start is usable.
export const startOnlyKeyboard = new Keyboard().text('Start').resized().persistent();

// Full layout for active staff: Start on its own row, then the 2x2 attendance grid.
export const attendanceKeyboard = new Keyboard()
	.text('Start')
	.row()
	.text('Login')
	.text('Logout')
	.row()
	.text('Out')
	.text('In')
	.row()
	.text('Lunch Out')
	.text('Lunch In')
	.resized()
	.persistent();
