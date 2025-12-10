import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Layout from '../components/Layout';
import { supabase, Business } from '../lib/supabase';
import { 
  Briefcase, 
  DollarSign, 
  TrendingUp, 
  CheckCircle,
  Plus,
  ArrowUpRight,
  Clock,
  BarChart3
} from 'lucide-react';

export default function Dashboard() {
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    total: 0,
    active: 0,
    draft: 0,
    sold: 0,
    totalValue: 0
  });

  useEffect(() => {
    fetchBusinesses();
  }, []);

  const fetchBusinesses = async () => {
    try {
      const { data, error } = await supabase
        .from('businesses')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      if (data) {
        setBusinesses(data);
        
        // Calculate stats
        const total = data.length;
        const active = data.filter(b => b.status === 'active').length;
        const draft = data.filter(b => b.status === 'draft').length;
        const sold = data.filter(b => b.status === 'sold').length;
        const totalValue = data.reduce((sum, b) => sum + Number(b.price), 0);

        setStats({ total, active, draft, sold, totalValue });
      }
    } catch (error) {
      console.error('Error fetching businesses:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  };

  const getStatusBadge = (status: string) => {
    const styles = {
      active: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      draft: 'bg-amber-50 text-amber-700 border-amber-200',
      sold: 'bg-blue-50 text-blue-700 border-blue-200',
      archived: 'bg-gray-50 text-gray-700 border-gray-200'
    };
    return styles[status as keyof typeof styles] || styles.archived;
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - date.getTime());
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-96">
          <div className="relative">
            <div className="w-16 h-16 border-4 border-gray-200 border-t-black rounded-full animate-spin"></div>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
            <p className="text-muted-foreground mt-1">Manage your digital business portfolio</p>
          </div>
          <Link
            to="/businesses/new"
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-black text-white rounded-lg hover:bg-black/90 transition-colors font-medium shadow-sm"
          >
            <Plus size={18} />
            <span>New Business</span>
          </Link>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Total Businesses */}
          <div className="group relative overflow-hidden bg-white border rounded-xl p-6 hover:shadow-md transition-all duration-200">
            <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-gray-50 to-transparent rounded-full -mr-16 -mt-16 opacity-50"></div>
            <div className="relative">
              <div className="flex items-center justify-between mb-3">
                <div className="p-2 bg-gray-100 rounded-lg">
                  <Briefcase className="w-5 h-5 text-gray-700" />
                </div>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground font-medium">Total Businesses</p>
                <p className="text-3xl font-bold tracking-tight">{stats.total}</p>
              </div>
            </div>
          </div>

          {/* Active Listings */}
          <div className="group relative overflow-hidden bg-white border rounded-xl p-6 hover:shadow-md transition-all duration-200">
            <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-emerald-50 to-transparent rounded-full -mr-16 -mt-16 opacity-50"></div>
            <div className="relative">
              <div className="flex items-center justify-between mb-3">
                <div className="p-2 bg-emerald-100 rounded-lg">
                  <CheckCircle className="w-5 h-5 text-emerald-700" />
                </div>
                <span className="text-xs font-medium text-emerald-700 bg-emerald-50 px-2 py-1 rounded-full">Active</span>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground font-medium">Active Listings</p>
                <p className="text-3xl font-bold tracking-tight text-emerald-600">{stats.active}</p>
              </div>
            </div>
          </div>

          {/* Businesses Sold */}
          <div className="group relative overflow-hidden bg-white border rounded-xl p-6 hover:shadow-md transition-all duration-200">
            <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-blue-50 to-transparent rounded-full -mr-16 -mt-16 opacity-50"></div>
            <div className="relative">
              <div className="flex items-center justify-between mb-3">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <TrendingUp className="w-5 h-5 text-blue-700" />
                </div>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground font-medium">Businesses Sold</p>
                <p className="text-3xl font-bold tracking-tight text-blue-600">{stats.sold}</p>
              </div>
            </div>
          </div>

          {/* Total Value */}
          <div className="group relative overflow-hidden bg-gradient-to-br from-black to-gray-800 border border-gray-800 rounded-xl p-6 hover:shadow-lg transition-all duration-200">
            <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-white/10 to-transparent rounded-full -mr-16 -mt-16"></div>
            <div className="relative">
              <div className="flex items-center justify-between mb-3">
                <div className="p-2 bg-white/10 rounded-lg">
                  <DollarSign className="w-5 h-5 text-white" />
                </div>
                <BarChart3 className="w-4 h-4 text-white/50" />
              </div>
              <div className="space-y-1">
                <p className="text-sm text-white/70 font-medium">Portfolio Value</p>
                <p className="text-2xl font-bold tracking-tight text-white">{formatCurrency(stats.totalValue)}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Recent Businesses */}
        <div className="bg-white border rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">Recent Businesses</h2>
              <p className="text-sm text-muted-foreground mt-0.5">Your latest business listings</p>
            </div>
            <Link 
              to="/businesses"
              className="inline-flex items-center gap-1.5 text-sm font-medium hover:underline underline-offset-4"
            >
              <span>View all</span>
              <ArrowUpRight size={14} />
            </Link>
          </div>
          
          {businesses.length > 0 ? (
            <div className="divide-y">
              {businesses.slice(0, 5).map((business) => (
                <Link
                  key={business.id}
                  to={`/businesses/${business.id}`}
                  className="block px-6 py-4 hover:bg-gray-50/50 transition-colors group"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start gap-3">
                        <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center flex-shrink-0 group-hover:from-gray-200 group-hover:to-gray-300 transition-colors">
                          <Briefcase className="w-5 h-5 text-gray-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold text-gray-900 group-hover:text-black transition-colors truncate">
                            {business.title}
                          </h3>
                          {business.tagline && (
                            <p className="text-sm text-muted-foreground mt-0.5 line-clamp-1">
                              {business.tagline}
                            </p>
                          )}
                          <div className="flex items-center gap-3 mt-2 flex-wrap">
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${getStatusBadge(business.status)}`}>
                              {business.status.charAt(0).toUpperCase() + business.status.slice(1)}
                            </span>
                            {business.industry && (
                              <span className="text-xs text-muted-foreground">
                                {business.industry}
                              </span>
                            )}
                            <span className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Clock className="w-3 h-3" />
                              {formatDate(business.created_at)}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-xl font-bold">{formatCurrency(business.price)}</p>
                      <p className="text-xs text-muted-foreground mt-1">{business.equity_percentage}% equity</p>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="px-6 py-16 text-center">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gray-100 mb-4">
                <Briefcase className="w-8 h-8 text-gray-400" />
              </div>
              <h3 className="text-lg font-semibold mb-2">No businesses yet</h3>
              <p className="text-sm text-muted-foreground mb-6 max-w-sm mx-auto">
                Get started by creating your first pre-made business to sell to entrepreneurs.
              </p>
              <Link
                to="/businesses/new"
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-black text-white rounded-lg hover:bg-black/90 transition-colors font-medium"
              >
                <Plus size={18} />
                <span>Create Your First Business</span>
              </Link>
            </div>
          )}
        </div>

        {/* Quick Stats Row */}
        {businesses.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white border rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Draft</p>
                  <p className="text-2xl font-bold mt-1">{stats.draft}</p>
                </div>
                <div className="w-10 h-10 rounded-lg bg-amber-50 flex items-center justify-center">
                  <Clock className="w-5 h-5 text-amber-600" />
                </div>
              </div>
            </div>

            <div className="bg-white border rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Avg. Price</p>
                  <p className="text-2xl font-bold mt-1">
                    {stats.total > 0 ? formatCurrency(stats.totalValue / stats.total) : '€0'}
                  </p>
                </div>
                <div className="w-10 h-10 rounded-lg bg-purple-50 flex items-center justify-center">
                  <BarChart3 className="w-5 h-5 text-purple-600" />
                </div>
              </div>
            </div>

            <div className="bg-white border rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Success Rate</p>
                  <p className="text-2xl font-bold mt-1">
                    {stats.total > 0 ? Math.round((stats.sold / stats.total) * 100) : 0}%
                  </p>
                </div>
                <div className="w-10 h-10 rounded-lg bg-green-50 flex items-center justify-center">
                  <TrendingUp className="w-5 h-5 text-green-600" />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}