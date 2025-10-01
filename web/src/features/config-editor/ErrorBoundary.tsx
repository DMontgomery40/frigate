import { Component, type ReactNode } from 'react';

type Props = { fallback: ReactNode; children: ReactNode };
type State = { hasError: boolean };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(err: any) {
    // eslint-disable-next-line no-console
    console.error('ConfigEditor crashed:', err);
  }

  render() {
    return this.state.hasError ? this.props.fallback : this.props.children;
  }
}

