import { createBrowserRouter } from 'react-router';

const router = createBrowserRouter([
  {
    path: '/',
    element: (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <h1 className="text-4xl font-bold">Orbit</h1>
          <p className="mt-2 text-gray-600">Personal AI Assistant</p>
        </div>
      </div>
    ),
  },
]);

export default router;
