import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

function TestRoutes() {
  return (
    <Routes>
      <Route path="/dashboard" element={<div>Dashboard</div>} />
      <Route path="/cohorts" element={<div>Retention</div>} />
      <Route path="/plans" element={<div>Plans</div>} />
    </Routes>
  );
}

describe('Admin routing', () => {
  it('renders dashboard route', () => {
    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <TestRoutes />
      </MemoryRouter>,
    );
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
  });

  it('renders retention route', () => {
    render(
      <MemoryRouter initialEntries={['/cohorts']}>
        <TestRoutes />
      </MemoryRouter>,
    );
    expect(screen.getByText('Retention')).toBeInTheDocument();
  });

  it('renders plans route', () => {
    render(
      <MemoryRouter initialEntries={['/plans']}>
        <TestRoutes />
      </MemoryRouter>,
    );
    expect(screen.getByText('Plans')).toBeInTheDocument();
  });
});
