export function requirePermission(permission: string) {
    return (req: any, res: any, next: any) => {
        if (!req.user?.role?.[permission]) {
            return res.status(403).json({
                error: "Forbidden",
            });
        }

        next();
    };
}