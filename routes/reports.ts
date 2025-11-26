import { Router, Request, Response } from 'express';
import { getUser, getAllUserReports, createUserReport, updateUserReport } from '../data/databaseAdapter.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { UserReport } from '../types.js';
import { v4 as uuid } from 'uuid';

const router = Router();

// Report a user
router.post('/', requireAuth, async (req: Request, res: Response) => {
	try {
		const userId = req.headers['x-user-id'] as string;
		const { reportedUserId, reason } = req.body;

		if (!userId) {
			return res.status(401).json({ error: 'Unauthorized' });
		}

		if (!reportedUserId || !reason || typeof reason !== 'string' || reason.trim().length === 0) {
			return res.status(400).json({ error: 'Invalid report data' });
		}

		if (userId === reportedUserId) {
			return res.status(400).json({ error: 'You cannot report yourself' });
		}

		// Get users (works with both JSON and Prisma)
		const reportedUser = await getUser(reportedUserId);
		if (!reportedUser) {
			return res.status(404).json({ error: 'User not found' });
		}

		// Create report
		const report: UserReport = {
			id: uuid(),
			reportedUserId,
			reporterUserId: userId,
			reason: reason.trim(),
			createdAt: new Date().toISOString(),
			status: 'pending',
		};

		// Create report (works with both JSON and Prisma)
		await createUserReport(report);

		const reporterUser = await getUser(userId);
		console.log(`🚨 User Report: ${reportedUser.username} reported by ${reporterUser?.username} - Reason: ${reason}`);

		res.json({ success: true, message: 'User reported successfully. Admin will review the report.' });
	} catch (error) {
		console.error('Report user error:', error);
		res.status(500).json({ error: 'Internal server error' });
	}
});

// Get all reports (admin only)
router.get('/', requireAdmin, async (req: Request, res: Response) => {
	try {
		// Get all reports (works with both JSON and Prisma)
		const allReports = await getAllUserReports();
		const reports = await Promise.all(
			allReports
				.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
				.map(async (report) => {
					const reportedUser = await getUser(report.reportedUserId);
					const reporterUser = await getUser(report.reporterUserId);
					return {
						...report,
						reportedUser: reportedUser ? {
							id: reportedUser.id,
							username: reportedUser.username,
							profileImageUrl: reportedUser.profileImageUrl,
						} : null,
						reporterUser: reporterUser ? {
							id: reporterUser.id,
							username: reporterUser.username,
							profileImageUrl: reporterUser.profileImageUrl,
						} : null,
					};
				})
		);

		res.json(reports);
	} catch (error) {
		console.error('Get reports error:', error);
		res.status(500).json({ error: 'Internal server error' });
	}
});

// Update report status (admin only)
router.put('/:reportId', requireAdmin, async (req: Request, res: Response) => {
	try {
		const { reportId } = req.params;
		const { status, adminNotes } = req.body;

		// Get report (works with both JSON and Prisma)
		const report = await getUserReport(reportId);

		if (!report) {
			return res.status(404).json({ error: 'Report not found' });
		}

		// Prepare updates
		const updates: any = {};
		if (status) {
			updates.status = status;
		}
		if (adminNotes !== undefined) {
			updates.adminNotes = adminNotes;
		}

		// Update report (works with both JSON and Prisma)
		const updatedReport = await updateUserReport(reportId, updates);

		res.json(updatedReport);
	} catch (error) {
		console.error('Update report error:', error);
		res.status(500).json({ error: 'Internal server error' });
	}
});

export default router;

